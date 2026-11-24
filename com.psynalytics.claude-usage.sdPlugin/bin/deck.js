import { VIEWS, buildFace, hasData } from "./faces.js";
import { renderFace, toDataUri } from "./render.js";
import { readSettings, withoutColours } from "./settings.js";
import { quietLog } from "./quiet-log.js";

const MANIFEST_ID = "com.psynalytics.claude-usage.view";
const USAGE_PAGE = "https://claude.ai/settings/usage";
const REDRAW_MS = 60000;
const HOLD_MS = 600;
const ROTATE_TICK_MS = 1000;

export function createDeck({ poller, history, openUrl, log, now, timeZone }) {
  const state = { poller, history, openUrl, log: quietLog(log), now, timeZone, visible: new Map(), pressedAt: new Map(), interval: null, rotator: null };
  return {
    manifestId: MANIFEST_ID,
    onWillAppear: (ev) => willAppear(state, ev),
    onWillDisappear: (ev) => willDisappear(state, ev),
    onDidReceiveSettings: (ev) => settingsChanged(state, ev),
    onSendToPlugin: (ev) => sentFromPanel(state, ev),
    onKeyDown: (ev) => keyDown(state, ev),
    onKeyUp: (ev) => keyUp(state, ev),
    onDialDown: () => refreshNow(state),
    onDialRotate: (ev) => rotate(state, ev),
    onTouchTap: (ev) => touchTap(state, ev),
  };
}

function remember(entry, raw, nowMs) {
  entry.raw = raw ?? {};
  entry.look = readSettings(entry.raw);
  entry.shown = entry.look.view;
  entry.dueMs = nowMs + entry.look.rotateSeconds * 1000;
}

async function willAppear(state, ev) {
  const entry = { action: ev.action, sent: null };
  remember(entry, ev.payload.settings, state.now());
  state.visible.set(ev.action.id, entry);
  const created = state.interval === null ? setInterval(() => cycle(state), REDRAW_MS).unref() : null;
  if (created !== null) state.interval = created;
  await redraw(state);
  if (created !== null && created === state.interval) await cycle(state);
}

async function willDisappear(state, ev) {
  state.visible.delete(ev.action.id);
  state.pressedAt.delete(ev.action.id);
  if (state.visible.size === 0 && state.interval !== null) {
    clearInterval(state.interval);
    state.interval = null;
    state.log("polling stopped");
  }
  await redraw(state);
}

async function settingsChanged(state, ev) {
  const entry = state.visible.get(ev.action.id);
  if (entry) remember(entry, ev.payload.settings, state.now());
  await redraw(state);
}

async function save(state, entry, raw) {
  remember(entry, raw, state.now());
  await Promise.all([entry.action.setSettings(entry.raw), redraw(state)]);
}

async function sentFromPanel(state, ev) {
  const entry = state.visible.get(ev.action.id);
  if (entry && ev.payload?.event === "resetColours") await save(state, entry, withoutColours(entry.raw));
}

async function cycle(state) {
  await state.poller.tick();
  await redraw(state);
}

async function refreshNow(state) {
  await state.poller.refresh();
  await redraw(state);
}

function keyDown(state, ev) {
  state.pressedAt.set(ev.action.id, state.now());
}

async function keyUp(state, ev) {
  const heldMs = state.now() - state.pressedAt.get(ev.action.id);
  state.pressedAt.delete(ev.action.id);
  if (heldMs >= HOLD_MS) return state.openUrl(USAGE_PAGE);
  return refreshNow(state);
}

function touchTap(state, ev) {
  return ev.payload.hold ? state.openUrl(USAGE_PAGE) : refreshNow(state);
}

async function rotate(state, ev) {
  const entry = state.visible.get(ev.action.id);
  const step = Math.sign(ev.payload.ticks);
  const view = VIEWS[(VIEWS.indexOf(entry.shown) + step + VIEWS.length) % VIEWS.length];
  await save(state, entry, { ...entry.raw, view });
}

function syncRotator(state) {
  const wanted = [...state.visible.values()].some((entry) => entry.look.rotate);
  if (wanted && state.rotator === null) state.rotator = setInterval(() => rotateDue(state), ROTATE_TICK_MS).unref();
  if (!wanted && state.rotator !== null) {
    clearInterval(state.rotator);
    state.rotator = null;
  }
}

function nextWithData(snapshot, viewId) {
  const start = VIEWS.indexOf(viewId);
  const later = VIEWS.map((_, step) => VIEWS[(start + step + 1) % VIEWS.length]);
  return later.find((id) => hasData(snapshot, id)) ?? viewId;
}

async function rotateDue(state) {
  const snapshot = state.poller.snapshot();
  const nowMs = state.now();
  const due = [...state.visible.values()].filter((entry) => entry.look.rotate && nowMs >= entry.dueMs);
  for (const entry of due) {
    entry.shown = nextWithData(snapshot, entry.shown);
    entry.dueMs = nowMs + entry.look.rotateSeconds * 1000;
  }
  if (due.length > 0) await redraw(state);
}

function sendFace(entry, face) {
  const isDial = entry.action.isDial();
  const uri = toDataUri(renderFace(face, isDial ? "slot" : "key", entry.look));
  if (uri === entry.sent) return null;
  entry.sent = uri;
  return isDial ? entry.action.setFeedback({ face: uri }) : entry.action.setImage(uri);
}

async function redraw(state) {
  syncRotator(state);
  const snapshot = state.poller.snapshot();
  const nowMs = state.now();
  const saving = state.history.record(snapshot.usage, snapshot.fetchedAtMs);
  const context = { points: state.history.points(snapshot.usage?.week), timeZone: state.timeZone };
  const sending = [...state.visible.values()].map((entry) => sendFace(entry, buildFace(snapshot, entry.shown, nowMs, context)));
  await Promise.all([saving, ...sending]);
}
