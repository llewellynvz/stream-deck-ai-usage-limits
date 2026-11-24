import { test } from "node:test";
import assert from "node:assert/strict";
import { createPoller } from "../com.psynalytics.claude-usage.sdPlugin/bin/poller.js";
import { burnState } from "../com.psynalytics.claude-usage.sdPlugin/bin/usage-model.js";

const MIN = 60000;
const ok = (percent) => ({ status: "ok", body: { limits: [{ kind: "weekly_all", percent, resets_at: null }] } });
const failed = (detail) => ({ status: "error", detail });
const limited = (retryAfterMs) => ({ status: "rate_limited", retryAfterMs });
const signedIn = (token) => ({ status: "ok", token, expiresAtMs: null });

function setup() {
  const h = { nowMs: 0, credential: signedIn("tok-A"), results: [], calls: [], lines: [] };
  h.poller = createPoller({
    readCredential: () => h.credential,
    fetchUsage: async (token) => {
      h.calls.push(token);
      return h.results.shift() ?? ok(26);
    },
    now: () => h.nowMs,
    log: (line) => h.lines.push(line),
  });
  h.at = (minutes, action = "tick") => {
    h.nowMs = minutes * MIN;
    return h.poller[action]();
  };
  h.state = () => h.poller.snapshot().state;
  return h;
}

async function walk(h, lastMinute, clockAt, resultAt) {
  const callsAt = [];
  for (let real = 0; real <= lastMinute; real += 1) {
    const before = h.calls.length;
    h.results[0] = resultAt(real);
    await h.at(clockAt(real));
    if (h.calls.length > before) callsAt.push(real);
  }
  return callsAt;
}

test("the first tick calls, a tick a minute later does not, a tick after 5 minutes does", async () => {
  const h = setup();
  assert.equal(h.state(), "loading");
  assert.equal(await h.at(0), true);
  assert.equal(h.state(), "ok");
  assert.equal(h.poller.snapshot().usage.week.percent, 26);
  assert.ok(h.lines.includes("limits weekly_all"));
  assert.equal(await h.at(1), false);
  assert.equal(h.calls.length, 1);
  await h.at(5);
  assert.equal(h.calls.length, 2);
});

test("an expired sign-in shows sign in without a call and recovers on the next due tick", async () => {
  const h = setup();
  h.credential = { status: "expired" };
  await h.at(0);
  assert.deepEqual([h.state(), h.calls.length], ["signin", 0]);
  h.credential = signedIn("tok-B");
  await h.at(5);
  assert.deepEqual([h.state(), h.calls.length], ["ok", 1]);
});

test("after a 403 the same token is held back and a different token is called", async () => {
  const h = setup();
  h.results.push({ status: "unauthorized", detail: "status 403" });
  await h.at(0);
  assert.equal(h.state(), "signin");
  assert.ok(h.lines.includes("unauthorized status 403"));
  await h.at(5);
  await h.at(6, "refresh");
  assert.equal(h.calls.length, 1);
  h.credential = signedIn("tok-B");
  await h.at(11);
  assert.deepEqual([h.state(), h.calls], ["ok", ["tok-A", "tok-B"]]);
});

test("a new token starts the burn samples again", async () => {
  const h = setup();
  await h.at(0);
  await h.at(5);
  assert.equal(h.poller.snapshot().burnSamples.length, 2);
  h.credential = signedIn("tok-B");
  h.results.push(ok(62));
  await h.at(10);
  assert.deepEqual(h.poller.snapshot().burnSamples, [{ atMs: 10 * MIN, percent: 62 }]);
});

test("a weekly reset time that moves by more than a minute starts the burn samples again", async () => {
  const h = setup();
  const week = (percent, resetsAt) => ({ status: "ok", body: { limits: [{ kind: "weekly_all", percent, resets_at: resetsAt }] } });
  h.results.push(week(6, "2026-11-29T05:00:00Z"), week(7, "2026-11-29T05:00:50Z"), week(61, "2026-11-30T09:00:00Z"));
  await h.at(0);
  await h.at(5);
  const kept = h.poller.snapshot().burnSamples.length;
  await h.at(10);
  assert.deepEqual([kept, h.poller.snapshot().burnSamples], [2, [{ atMs: 10 * MIN, percent: 61 }]]);
});

test("Retry-After of 600 s keeps the figures and blocks tick and refresh for 600 s", async () => {
  const h = setup();
  await h.at(0);
  h.results.push(limited(600000));
  await h.at(5);
  assert.ok(h.lines.includes("rate_limited 600"));
  await h.at(14);
  await h.at(14.9, "refresh");
  assert.equal(h.calls.length, 2);
  assert.deepEqual([h.state(), h.poller.snapshot().usage.week.percent], ["ok", 26]);
  await h.at(15);
  assert.equal(h.calls.length, 3);
});

test("a long Retry-After lets the data turn offline with no call", async () => {
  const h = setup();
  await h.at(0);
  h.results.push(limited(1800000));
  await h.at(25);
  await h.at(31);
  assert.deepEqual([h.state(), h.calls.length], ["offline", 2]);
  assert.ok(h.lines.includes("state offline"));
});

test("after a 31 minute pause the data reads loading until the next call decides, with no offline line", async () => {
  const h = setup();
  await h.at(0);
  let release;
  h.results.push(new Promise((resolve) => {
    release = resolve;
  }));
  h.nowMs = 31 * MIN;
  const before = h.state();
  const ticking = h.poller.tick();
  const during = h.state();
  release(ok(30));
  await ticking;
  assert.deepEqual([before, during, h.state(), h.lines.includes("state offline")], ["loading", "loading", "ok", false]);
});

test("a first call that is rate limited or fails gives offline, never loading", async () => {
  for (const result of [limited(300000), failed("status 503")]) {
    const h = setup();
    h.results.push(result);
    await h.at(0);
    assert.equal(h.state(), "offline");
  }
});

test("an unreadable sign-in file keeps fresh data and makes no call", async () => {
  const h = setup();
  await h.at(0);
  h.credential = { status: "unreadable" };
  await h.at(5);
  assert.deepEqual([h.state(), h.calls.length], ["ok", 1]);
  assert.ok(h.lines.includes("error sign-in file unreadable"));
});

test("errors for 31 minutes turn ok into offline and each one is logged", async () => {
  const h = setup();
  await h.at(0);
  for (const minute of [5, 10, 15, 20, 25]) {
    h.results.push(failed("status 503"));
    await h.at(minute);
  }
  assert.equal(h.state(), "ok");
  h.results.push(failed("status 503"));
  await h.at(30);
  await h.at(31);
  assert.equal(h.state(), "offline");
  assert.equal(h.lines.filter((line) => line === "error status 503").length, 6);
});

test("refresh calls at most once in 30 s", async () => {
  const h = setup();
  await h.at(0, "refresh");
  await h.at(0.25, "refresh");
  assert.equal(h.calls.length, 1);
  await h.at(0.5, "refresh");
  assert.equal(h.calls.length, 2);
});

test("a refresh during a pending tick shares its call", async () => {
  const h = setup();
  let release;
  h.results.push(new Promise((resolve) => {
    release = resolve;
  }));
  const ticking = h.at(0);
  const refreshing = h.poller.refresh();
  release(ok(26));
  assert.deepEqual(await Promise.all([ticking, refreshing]), [true, true]);
  assert.equal(h.calls.length, 1);
});

test("a clock set back by an hour calls when the next call was due before the set-back", async () => {
  const h = setup();
  h.nowMs = 120 * MIN;
  h.state();
  await h.at(60);
  await h.at(0);
  const held = h.calls.length;
  await h.at(5);
  assert.deepEqual([held, h.calls.length], [1, 2]);
});

test("a clock set back 20 minutes during errors turns the old data offline and keeps calls 5 minutes apart", async () => {
  const h = setup();
  const callsAt = await walk(h, 49, (real) => (real >= 26 ? real - 20 : real), (real) => (real === 0 ? ok(26) : failed("status 503")));
  assert.deepEqual([h.state(), callsAt], ["offline", [0, 5, 10, 15, 20, 25, 31, 36, 41, 46]]);
});

test("a clock set back 4 minutes between samples keeps the burn span and rate true", async () => {
  const h = setup();
  const callsAt = await walk(h, 100, (real) => (real >= 64 ? real - 4 : real), (real) => ok(real / 5));
  const { burnSamples } = h.poller.snapshot();
  const spanMs = burnSamples.at(-1).atMs - burnSamples[0].atMs;
  const trueMs = (callsAt.at(-1) - callsAt[callsAt.length - burnSamples.length]) * MIN;
  assert.ok(Math.abs(spanMs - trueMs) <= MIN, `span ${spanMs} true ${trueMs}`);
  assert.deepEqual(burnState(burnSamples), { kind: "rising", ratePerHour: 12 });
});

test("a clock set back one minute inside a Retry-After window makes no call until the window ends", async () => {
  const h = setup();
  h.results.push(ok(26), limited(1800000));
  for (const minute of [0, 5, 4, 33]) await h.at(minute);
  const held = h.calls.length;
  await h.at(34);
  assert.deepEqual([held, h.calls.length], [2, 3]);
});

test("from sign-in a renewed token is called at the next tick 30 s after the last call, and a failure gives offline", async () => {
  const h = setup();
  h.results.push({ status: "unauthorized", detail: "status 401" }, failed("status 503"));
  await h.at(0);
  h.credential = signedIn("tok-B");
  await h.at(0.25);
  const early = [...h.calls];
  await h.at(1);
  assert.deepEqual([early, h.calls, h.state()], [["tok-A"], ["tok-A", "tok-B"], "offline"]);
});

test("after an unreadable sign-in file the next tick retries even when it lands a moment early", async () => {
  const h = setup();
  h.credential = { status: "unreadable" };
  await h.at(0);
  h.credential = signedIn("tok-A");
  await h.at(59999 / MIN);
  assert.deepEqual([h.state(), h.calls.length], ["ok", 1]);
});

test("a refused token is tried again after 30 minutes and held back again when refused", async () => {
  const h = setup();
  const refused = { status: "unauthorized", detail: "status 403" };
  h.results.push(refused, refused);
  for (const minute of [0, 29, 30, 59]) await h.at(minute);
  const held = h.calls.length;
  await h.at(60);
  assert.deepEqual([held, h.calls.length, h.state()], [2, 3, "ok"]);
});

test("a clock set back carries the data age and the burn samples with it", async () => {
  const h = setup();
  await h.at(55);
  await h.at(60);
  h.nowMs = 0;
  const shown = h.state();
  await h.at(0);
  assert.deepEqual([shown, h.poller.snapshot().burnSamples], ["ok", [{ atMs: -5 * MIN, percent: 26 }, { atMs: 0, percent: 26 }]]);
});

test("the log never holds the token", async () => {
  const leaks = (lines) => lines.some((line) => line.includes("tok-"));
  assert.equal(leaks(["planted line tok-A"]), true);
  const h = setup();
  h.results.push(ok(26), { status: "unauthorized", detail: "status 401" });
  await h.at(0);
  await h.at(5);
  h.credential = signedIn("tok-B");
  h.results.push(limited(300000), failed("TimeoutError"));
  await h.at(10);
  await h.at(15);
  h.credential = { status: "unreadable" };
  await h.at(20);
  h.credential = { status: "expired" };
  await h.at(25);
  assert.ok(h.lines.length >= 7);
  assert.equal(leaks(h.lines), false);
});
