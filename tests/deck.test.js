import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createDeck } from "../com.psynalytics.claude-usage.sdPlugin/bin/deck.js";
import { createPoller } from "../com.psynalytics.claude-usage.sdPlugin/bin/poller.js";
import { createHistory } from "../com.psynalytics.claude-usage.sdPlugin/bin/history.js";
import { NOW, okSnapshot } from "./rows.js";

const USAGE_PAGE = "https://claude.ai/settings/usage";
const LOADING = { state: "loading", usage: null, burnSamples: [] };
const OFFLINE = { state: "offline", usage: null, burnSamples: [] };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const svgOf = (uri) => Buffer.from(uri.split(",")[1], "base64").toString("utf8");
const lastSvg = (action) => svgOf(action.setFeedback.mock.calls.at(-1).arguments[0].face);
const never = () => new Promise(() => {});

beforeEach(() => {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: NOW });
  mock.method(globalThis, "setInterval");
});

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

function fakePoller(snapshot = LOADING, tickResult = Promise.resolve(false)) {
  return { tick: mock.fn(() => tickResult), refresh: mock.fn(async () => false), snapshot: () => snapshot };
}

function fakeAction(id, dial = true) {
  const sent = () => mock.fn(async () => {});
  const device = { id: "dev-1" };
  return { id, manifestId: "com.psynalytics.claude-usage.view", device, isDial: () => dial, setFeedback: sent(), setImage: sent(), setSettings: sent() };
}

function setup(poller = fakePoller()) {
  const lines = [];
  const openUrl = mock.fn(async () => {});
  const history = createHistory(() => {});
  const deck = createDeck({ poller, history, openUrl, log: (line) => lines.push(line), now: () => Date.now(), timeZone: "Europe/Amsterdam" });
  return { deck, poller, openUrl, lines };
}

const appear = (action, settings = {}) => ({ action, payload: { settings } });
const gone = ({ id, manifestId, device }) => ({ action: { id, manifestId, device } });
const rotate = (action, ticks) => ({ action, payload: { ticks } });
const COLOURED = { view: "week", chart: "ring", ground: "#000000", bar: "#00ff00", text: "#ff0000" };

test("a dial that appears is drawn once and the poller ticks once", async () => {
  const { deck, poller } = setup();
  const dial = fakeAction("d1");
  assert.equal(deck.manifestId, "com.psynalytics.claude-usage.view");
  await deck.onWillAppear(appear(dial));
  assert.equal(dial.setFeedback.mock.callCount(), 1);
  assert.ok(dial.setFeedback.mock.calls[0].arguments[0].face.startsWith("data:image/svg+xml;base64,"));
  assert.equal(poller.tick.mock.callCount(), 1);
});

test("rotating steps the view, saves it with every other setting kept and redraws at once", async () => {
  const { deck } = setup(fakePoller(okSnapshot()));
  const up = fakeAction("up");
  const down = fakeAction("down");
  await deck.onWillAppear(appear(up, COLOURED));
  await deck.onWillAppear(appear(down));
  await deck.onDialRotate(rotate(up, 1));
  await deck.onDialRotate(rotate(down, -1));
  assert.deepEqual(up.setSettings.mock.calls[0].arguments, [{ ...COLOURED, view: "model" }]);
  assert.deepEqual(down.setSettings.mock.calls[0].arguments, [{ view: "session" }]);
  assert.equal(up.setFeedback.mock.callCount(), 2);
});

test("a dial saved on the old forecast view opens on Runs out", async () => {
  const { deck } = setup(fakePoller(okSnapshot()));
  const dial = fakeAction("d1");
  await deck.onWillAppear(appear(dial, { view: "forecast" }));
  assert.ok(lastSvg(dial).includes(">Runs out</text>"));
});

test("reset colours saves the settings without the three colours and redraws in the defaults", async () => {
  const { deck } = setup(fakePoller(okSnapshot()));
  const dial = fakeAction("d1");
  await deck.onWillAppear(appear(dial, COLOURED));
  assert.ok(lastSvg(dial).includes("fill=\"#000000\""));
  await deck.onSendToPlugin({ action: dial, payload: { event: "resetColours" } });
  assert.deepEqual(dial.setSettings.mock.calls.map((call) => call.arguments), [[{ view: "week", chart: "ring" }]]);
  assert.ok(lastSvg(dial).includes("fill=\"#12142D\"") && lastSvg(dial).includes("r=\"22.5\""));
});

test("a key held 600 ms or more opens the usage page, a short press refreshes", async () => {
  const { deck, poller, openUrl } = setup();
  const key = fakeAction("k1", false);
  await deck.onWillAppear(appear(key));
  assert.equal(key.setImage.mock.callCount(), 1);
  deck.onKeyDown({ action: key });
  mock.timers.tick(700);
  await deck.onKeyUp({ action: key });
  assert.deepEqual(openUrl.mock.calls.map((call) => call.arguments), [[USAGE_PAGE]]);
  assert.equal(poller.refresh.mock.callCount(), 0);
  deck.onKeyDown({ action: key });
  mock.timers.tick(200);
  await deck.onKeyUp({ action: key });
  assert.deepEqual([poller.refresh.mock.callCount(), openUrl.mock.callCount()], [1, 1]);
});

test("auto-rotate steps through the views with data on one timer, never saves, and stops with the last rotating action", async () => {
  mock.method(globalThis, "clearInterval");
  const { deck } = setup(fakePoller(okSnapshot({ session: null })));
  const fast = fakeAction("fast");
  const slow = fakeAction("slow");
  const rotating = { view: "burn", rotate: true, rotateSeconds: 3 };
  await deck.onWillAppear(appear(fakeAction("still")));
  await deck.onWillAppear(appear(fast, rotating));
  await deck.onWillAppear(appear(slow, { ...rotating, rotateSeconds: 120 }));
  const shown = [];
  for (let step = 0; step < 3; step += 1) {
    mock.timers.tick(3000);
    await flush();
    shown.push(lastSvg(fast).match(/font-size="14" font-weight="500" fill-opacity="0.9">([^<]*)</)[1]);
  }
  assert.deepEqual([shown, setInterval.mock.callCount(), fast.setSettings.mock.callCount()], [["Runs out", "Today", "Week"], 2, 0]);
  assert.ok(lastSvg(slow).includes(">Burn</text>"));
  await deck.onDialRotate(rotate(fast, 1));
  assert.deepEqual(fast.setSettings.mock.calls[0].arguments, [{ ...rotating, view: "model" }]);
  const rotator = setInterval.mock.calls[1].result;
  await deck.onWillDisappear(gone(fast));
  assert.equal(clearInterval.mock.calls.some((call) => call.arguments[0] === rotator), false);
  await deck.onWillDisappear(gone(slow));
  assert.equal(clearInterval.mock.calls.some((call) => call.arguments[0] === rotator), true);
});

test("a long touch opens the usage page, a press or a tap refreshes", async () => {
  const { deck, poller, openUrl } = setup();
  const dial = fakeAction("d1");
  await deck.onWillAppear(appear(dial));
  await deck.onTouchTap({ action: dial, payload: { hold: true } });
  assert.deepEqual(openUrl.mock.calls.map((call) => call.arguments), [[USAGE_PAGE]]);
  await deck.onDialDown({ action: dial });
  await deck.onTouchTap({ action: dial, payload: { hold: false } });
  assert.equal(poller.refresh.mock.callCount(), 2);
});

test("polling runs each minute and stops when the last action disappears", async () => {
  const { deck, poller, lines } = setup();
  const dial = fakeAction("d1");
  const key = fakeAction("k1", false);
  await deck.onWillAppear(appear(dial));
  await deck.onWillAppear(appear(key));
  mock.timers.tick(60000);
  await flush();
  assert.equal(poller.tick.mock.callCount(), 2);
  await deck.onWillDisappear(gone(dial));
  await deck.onWillDisappear(gone(key));
  assert.ok(lines.includes("polling stopped"));
  mock.timers.tick(120000);
  await flush();
  assert.equal(poller.tick.mock.callCount(), 2);
});

test("three dials appearing during a pending tick start one interval", async () => {
  const { deck, poller } = setup(fakePoller(LOADING, never()));
  const dials = ["a", "b", "c"].map((id) => fakeAction(id));
  dials.forEach((dial) => deck.onWillAppear(appear(dial)));
  await flush();
  assert.equal(setInterval.mock.callCount(), 1);
  for (const dial of dials) await deck.onWillDisappear(gone(dial));
  mock.timers.tick(120000);
  await flush();
  assert.equal(poller.tick.mock.callCount(), 1);
});

test("after everything disappeared a dial that appears again draws, starts one interval and ticks", async () => {
  const { deck, poller } = setup();
  const dial = fakeAction("d1");
  await deck.onWillAppear(appear(dial));
  await deck.onWillDisappear(gone(dial));
  await deck.onWillAppear(appear(dial));
  assert.deepEqual([dial.setFeedback.mock.callCount(), setInterval.mock.callCount()], [2, 2]);
  assert.equal(poller.tick.mock.callCount(), 2);
});

test("an action that disappears before its first draw finishes starts no poll", async () => {
  const { deck, poller } = setup();
  const dial = fakeAction("d1");
  const appearing = deck.onWillAppear(appear(dial));
  await deck.onWillDisappear(gone(dial));
  await appearing;
  assert.equal(poller.tick.mock.callCount(), 0);
});

test("a log that throws never rejects a poll or a handler, and the new figure is still drawn", async () => {
  const log = () => {
    throw new Error("log write failed");
  };
  const failed = { status: "error", detail: "status 503" };
  const results = [{ status: "ok", body: { limits: [{ kind: "weekly_all", percent: 26 }] } }, failed, failed];
  const readCredential = () => ({ status: "ok", token: "tok", expiresAtMs: null });
  const poller = createPoller({ readCredential, fetchUsage: async () => results.shift(), now: () => Date.now(), log });
  const deck = createDeck({ poller, history: createHistory(() => {}), openUrl: async () => {}, log, now: () => Date.now() });
  const dial = fakeAction("d1");
  await deck.onWillAppear(appear(dial));
  mock.timers.tick(300000);
  await flush();
  mock.timers.tick(30000);
  await deck.onDialDown({ action: dial });
  await deck.onWillDisappear(gone(dial));
  assert.deepEqual([lastSvg(dial).includes(">26<"), results.length], [true, 0]);
});

test("a dial that appears while the poller reads offline shows Offline at once", async () => {
  const { deck } = setup(fakePoller(OFFLINE, never()));
  const dial = fakeAction("d1");
  deck.onWillAppear(appear(dial));
  await flush();
  assert.equal(dial.setFeedback.mock.callCount(), 1);
  assert.ok(lastSvg(dial).includes(">Offline</text>"));
});
