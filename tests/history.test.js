import { test } from "node:test";
import assert from "node:assert/strict";
import { windowKey, addPoint, readStored, createHistory, dayRises, todayFigures } from "../com.psynalytics.claude-usage.sdPlugin/bin/history.js";
import { buildFace } from "../com.psynalytics.claude-usage.sdPlugin/bin/faces.js";

const HOUR = 3600000;
const ZONE = "Europe/Amsterdam";
const at = (iso) => Date.parse(iso);
const point = (iso, week, model = null) => ({ atMs: at(iso), week, model });
const NOW = at("2026-11-24T15:00:00Z");
const RESET = at("2026-11-29T05:00:00Z");

test("a window is the weekly reset time rounded to the minute", () => {
  assert.equal(windowKey(at("2026-11-29T05:00:00.573Z")), windowKey(at("2026-11-29T05:00:29Z")));
  assert.notEqual(windowKey(at("2026-11-29T05:00:00Z")), windowKey(at("2026-11-29T05:01:00Z")));
});

test("one point an hour, at most 200 points and three windows, an older window comes back to the front", () => {
  let windows = [];
  for (let hour = 0; hour < 230; hour += 0.5) windows = addPoint(windows, 1, { atMs: hour * HOUR, week: 1, model: null });
  assert.deepEqual([windows[0].points.length, windows[0].points[0].atMs], [200, 30 * HOUR]);
  for (const key of [2, 3, 4]) windows = addPoint(windows, key, { atMs: 0, week: 1, model: null });
  assert.deepEqual(windows.map((window) => window.key), [4, 3, 2]);
  windows = addPoint(windows, 2, { atMs: 5 * HOUR, week: 9, model: 8 });
  assert.deepEqual([windows.map((window) => window.key), windows[0].points.length], [[2, 4, 3], 2]);
});

test("a point from a clock that ran ahead is dropped by the next point, and a same-hour repeat still changes nothing", () => {
  const now = { atMs: NOW, week: 30, model: null };
  const windows = addPoint([{ key: 1, points: [{ atMs: NOW + 26 * HOUR, week: 50, model: null }] }], 1, now);
  assert.deepEqual(windows, [{ key: 1, points: [now] }]);
  assert.equal(addPoint(windows, 1, { ...now, atMs: NOW + 600000 }), windows);
});

test("a stored history loads at most three windows, each the newest 200 points in time order", () => {
  const points = Array.from({ length: 205 }, (_, index) => ({ atMs: (204 - index) * HOUR, week: 1, model: null }));
  const loaded = readStored([1, 2, 3, 4].map((key) => ({ key, points })));
  assert.deepEqual(loaded.map((window) => window.key), [1, 2, 3]);
  assert.deepEqual(loaded[0].points.map((stored) => stored.atMs), Array.from({ length: 200 }, (_, index) => (index + 5) * HOUR));
});

test("a stored history of the wrong shape is dropped and never trusted", () => {
  const good = point("2026-11-24T08:00:00Z", 40, 12);
  const stored = [{ key: "x", points: [good] }, { key: 7, points: [{ ...good, week: "40" }, { ...good, extra: "<svg>" }, { atMs: 1, week: 5 }] }, 5];
  assert.deepEqual(readStored(stored), [{ key: 7, points: [good] }]);
  assert.deepEqual([readStored("x"), readStored(undefined), readStored([{ key: 1, points: "y" }])], [[], [], []]);
});

test("the history writes once per new hourly point, and never before the stored history has loaded", () => {
  const saved = [];
  const history = createHistory((value) => saved.push(value));
  const usage = { week: { percent: 30, resetsAtMs: RESET }, model: { percent: 12, resetsAtMs: RESET } };
  history.record(usage, NOW);
  history.load({ history: [{ key: windowKey(RESET), points: [point("2026-11-24T10:00:00Z", 20)] }] });
  history.record(usage, NOW);
  history.record(usage, NOW + 600000);
  assert.deepEqual(saved, [{ history: [{ key: windowKey(RESET), points: [point("2026-11-24T10:00:00Z", 20), { atMs: NOW, week: 30, model: 12 }] }] }]);
  assert.equal(history.points(usage.week).length, 2);
});

test("each local day of the window rises by its own use, days to come and days with no data have none", () => {
  const points = [point("2026-11-22T12:00:00Z", 5), point("2026-11-23T10:00:00Z", 9), point("2026-11-23T22:00:00Z", 14), point("2026-11-24T15:00:00Z", 20)];
  const rises = (list) => dayRises(list.map(({ atMs, week }) => ({ atMs, percent: week })), RESET - 168 * HOUR, RESET, NOW, ZONE);
  const later = Array(5).fill({ rise: null, today: false });
  assert.deepEqual(rises(points), [{ rise: 5, today: false }, { rise: 9, today: false }, { rise: 6, today: true }, ...later]);
  assert.deepEqual(rises(points.slice(1)).slice(0, 3).map((day) => day.rise), [null, 5, 6]);
});

function today(week, points, reset = RESET) {
  const face = buildFace({ state: "ok", usage: { week: { percent: week, resetsAtMs: reset, label: "Week" } }, burnSamples: [] }, "today", NOW, { points, timeZone: ZONE });
  return [face.value, face.sub, face.meta];
}

test("today counts from the last point before local midnight, the window start or the earliest point", () => {
  assert.deepEqual(today(39, [point("2026-11-23T20:00:00Z", 30)]), ["9% used", "4% left for today", "safe 13% a day"]);
  assert.deepEqual(today(5, [], at("2026-12-01T09:00:00Z")), ["5% used", "9% left for today", "safe 14% a day"]);
  assert.deepEqual(today(43, [point("2026-11-24T08:00:00Z", 40)]), ["3% used", "9% left for today", "since 09:00"]);
  assert.deepEqual(today(50, [point("2026-11-23T20:00:00Z", 30)]), ["20% used", "Over by 7%", "safe 13% a day"]);
});

test("today's allowance is never spread over less than one day", () => {
  const reset = at("2026-11-24T10:00:00Z");
  const points = [{ atMs: at("2026-11-23T22:00:00Z"), percent: 20 }, { atMs: at("2026-11-24T00:00:00Z"), percent: 25 }];
  const figures = todayFigures(points, reset - 168 * HOUR, reset, at("2026-11-24T00:00:00Z"), ZONE);
  assert.deepEqual([figures.allowance, figures.sinceMs], [80, null]);
});
