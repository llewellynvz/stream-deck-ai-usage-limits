import { parseUsage, limitKinds, addBurnSample, sameWindow } from "./usage-model.js";
import { quietLog } from "./quiet-log.js";

const POLL_MS = 300000;
const UNREADABLE_RETRY_MS = 30000;
const MIN_GAP_MS = 30000;
const MAX_WAIT_MS = 1800000;
const STALE_MS = 1800000;
const BLOCK_MS = 1800000;
const SHIFTED_TIMES = ["lastAttemptMs", "nextDueMs", "holdUntilMs", "blockedUntilMs"];

export function createPoller({ readCredential, fetchUsage, now, log }) {
  const state = {
    readCredential,
    fetchUsage,
    now,
    log: quietLog(log),
    stored: "loading",
    usage: null,
    burnSamples: [],
    fetchedAtMs: null,
    lastReadMs: -Infinity,
    lastAttemptMs: -Infinity,
    nextDueMs: -Infinity,
    holdUntilMs: -Infinity,
    okToken: null,
    blockedToken: null,
    blockedUntilMs: -Infinity,
    kinds: null,
    version: 0,
    pending: null,
  };
  return { tick: () => tick(state), refresh: () => refresh(state), snapshot: () => snapshot(state) };
}

function readClock(state) {
  const nowMs = state.now();
  if (nowMs < state.lastReadMs) shiftTimes(state, state.lastReadMs - nowMs);
  state.lastReadMs = nowMs;
  return nowMs;
}

function shiftTimes(state, backMs) {
  for (const key of SHIFTED_TIMES) state[key] -= backMs;
  if (state.fetchedAtMs !== null) state.fetchedAtMs -= backMs;
  state.burnSamples = state.burnSamples.map((sample) => ({ ...sample, atMs: sample.atMs - backMs }));
}

function isFresh(state, nowMs) {
  return state.fetchedAtMs !== null && nowMs - state.fetchedAtMs < STALE_MS;
}

function isStale(state, nowMs) {
  return state.stored === "ok" && !isFresh(state, nowMs);
}

function staleShown(state, nowMs) {
  const calling = state.pending !== null || isDue(state, nowMs);
  return calling && nowMs >= state.holdUntilMs ? "loading" : "offline";
}

function snapshot(state) {
  const nowMs = readClock(state);
  const shown = isStale(state, nowMs) ? staleShown(state, nowMs) : state.stored;
  return { state: shown, usage: state.usage, burnSamples: state.burnSamples, fetchedAtMs: state.fetchedAtMs };
}

function setStored(state, next) {
  if (state.stored === next) return;
  state.stored = next;
  state.version += 1;
  state.log(`state ${next}`);
}

function isDue(state, nowMs) {
  return nowMs >= state.nextDueMs;
}

function mayRefresh(state, nowMs) {
  return nowMs - state.lastAttemptMs >= MIN_GAP_MS && nowMs >= state.holdUntilMs;
}

function isBlocked(state, token, nowMs) {
  return token === state.blockedToken && nowMs < state.blockedUntilMs;
}

function signinCleared(state, nowMs) {
  if (state.stored !== "signin") return false;
  const credential = state.readCredential();
  return credential.status === "ok" && !isBlocked(state, credential.token, nowMs) && mayRefresh(state, nowMs);
}

async function tick(state) {
  const before = state.version;
  const nowMs = readClock(state);
  const due = isDue(state, nowMs) || signinCleared(state, nowMs);
  if (!due && !state.pending && isStale(state, nowMs)) setStored(state, "offline");
  if (state.pending || due) await attemptOnce(state);
  return state.version !== before;
}

async function refresh(state) {
  const before = state.version;
  if (state.pending || mayRefresh(state, readClock(state))) await attemptOnce(state);
  return state.version !== before;
}

function attemptOnce(state) {
  state.pending ??= attempt(state).finally(() => {
    state.pending = null;
  });
  return state.pending;
}

async function attempt(state) {
  const startMs = readClock(state);
  state.lastAttemptMs = startMs;
  state.nextDueMs = startMs + POLL_MS;
  const credential = state.readCredential();
  if (credential.status === "unreadable") return onUnreadable(state, startMs);
  if (credential.status !== "ok" || isBlocked(state, credential.token, startMs)) return setStored(state, "signin");
  const result = await state.fetchUsage(credential.token);
  if (result.status === "ok") return onSuccess(state, result.body, credential.token);
  if (result.status === "unauthorized") return onUnauthorized(state, result.detail, credential.token);
  if (result.status === "rate_limited") return onRateLimited(state, result.retryAfterMs);
  return onFailure(state, `error ${result.detail}`);
}

function onSuccess(state, body, token) {
  const nowMs = readClock(state);
  const usage = parseUsage(body);
  const kinds = limitKinds(body).join(",");
  const kindsChanged = kinds !== state.kinds;
  const samples = token === state.okToken && sameWindow(state.usage?.week, usage.week) ? state.burnSamples : [];
  state.burnSamples = usage.week ? addBurnSample(samples, usage.week.percent, nowMs) : samples;
  Object.assign(state, { kinds, usage, okToken: token, fetchedAtMs: nowMs, version: state.version + 1 });
  if (kindsChanged) state.log(`limits ${kinds}`);
  setStored(state, "ok");
}

function onUnauthorized(state, detail, token) {
  Object.assign(state, { blockedToken: token, blockedUntilMs: readClock(state) + BLOCK_MS });
  state.log(`unauthorized ${detail}`);
  setStored(state, "signin");
}

function onRateLimited(state, retryAfterMs) {
  const nowMs = readClock(state);
  const waitMs = Math.min(Math.max(retryAfterMs, POLL_MS), MAX_WAIT_MS);
  state.nextDueMs = nowMs + waitMs;
  state.holdUntilMs = nowMs + waitMs;
  state.log(`rate_limited ${Math.round(retryAfterMs / 1000)}`);
  keepOrOffline(state, nowMs);
}

function onUnreadable(state, startMs) {
  state.nextDueMs = startMs + UNREADABLE_RETRY_MS;
  onFailure(state, "error sign-in file unreadable");
}

function onFailure(state, line) {
  state.log(line);
  keepOrOffline(state, readClock(state));
}

function keepOrOffline(state, nowMs) {
  if (state.stored !== "ok" || !isFresh(state, nowMs)) setStored(state, "offline");
}
