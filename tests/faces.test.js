import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFace, VIEWS } from "../com.psynalytics.claude-usage.sdPlugin/bin/faces.js";
import { WEEK_MS, parseUsage } from "../com.psynalytics.claude-usage.sdPlugin/bin/usage-model.js";
import { ROWS, NOW, MIN, ZONE, MODEL_LABEL, okSnapshot, sample } from "./rows.js";

const EXPECTED = {
  "ok-week": ["calendar-dots", "Week", "5d 12h", "21%", null, 21],
  "ok-model": ["cpu", MODEL_LABEL, "5d 12h", "24%", null, 24],
  "ok-burn-rising": ["fire", "Burn", "per hour", "5%", "Full in 15h 48m", null],
  "ok-burn-idle": ["fire", "Burn", "per hour", "Idle", "No rise measured", null],
  "ok-burn-measuring": ["fire", "Burn", "per hour", "Wait", "Measuring", null],
  "ok-runsout": ["gauge", "Runs out", "at this pace", "Lasts", "Ends the week near 99%", null, "bar"],
  "ok-runsout-early": ["gauge", "Runs out", "at this pace", "Early", "Too early to say", null],
  "ok-runsout-soon": ["gauge", "Runs out", "at this pace", "Thu 04:39", "16h 31m before the reset", null, "warn"],
  "ok-today": ["calendar-dots", "Today", "since 17:35", "0% used", "14% left for today", null],
  "ok-session": ["timer", "Session", "1h 48m", "64%", null, 64],
  "ok-no-data": ["timer", "Session", null, "None", "No data for this view", null],
  signin: ["sign-in", "Account", null, "Sign in", "Open Claude Code once", null],
  offline: ["warning-circle", "Usage", null, "Offline", "Will retry", null],
  loading: ["calendar-dots", "Week", null, "Loading", null, null],
};

const asFace = ([icon, label, meta, value, sub, percent, dot = null]) => ({ icon, label, meta, value, sub, dot, percent });
const shownOf = ({ gauge, ...face }) => ({ ...face, percent: gauge?.percent ?? null });
const faceAt = (snapshot, viewId) => shownOf(buildFace(snapshot, viewId, NOW, { points: [], timeZone: ZONE }));

test("the views in rotation order", () => {
  assert.deepEqual(VIEWS, ["week", "model", "burn", "runsout", "today", "session"]);
});

for (const row of ROWS) {
  test(`face for ${row.name}`, () => {
    assert.deepEqual(faceAt(row.snapshot, row.viewId), asFace(EXPECTED[row.name]));
  });
}

test("runs out at the week's average pace: the live case lasts, a fast week names the day, a full week is now", () => {
  const week = (percent, elapsed) => okSnapshot({ week: { percent, resetsAtMs: NOW + (1 - elapsed) * WEEK_MS, label: "Week" } });
  const words = (snapshot) => {
    const face = faceAt(snapshot, "runsout");
    return [face.value, face.sub, face.dot];
  };
  assert.deepEqual(words(week(6, 0.353)), ["Lasts", "Ends the week near 17%", "bar"]);
  assert.deepEqual(words(week(49.8, 0.5)), ["Lasts", "Ends the week near 99%", "bar"]);
  assert.deepEqual(words(week(61, 0.55)), ["Thu 04:39", "16h 31m before the reset", "warn"]);
  assert.deepEqual([words(week(100, 0.5)), words(week(0.4, 0.5))], [["Now", "Limit reached", null], ["Lasts", "No usage yet", null]]);
});

test("a week without a reset time has no countdown, no trend, and no runs out or today", () => {
  const snapshot = okSnapshot({ week: { percent: 21, resetsAtMs: null, label: "Week" } });
  const week = buildFace(snapshot, "week", NOW);
  assert.deepEqual([week.meta, week.gauge.trend], [null, null]);
  assert.deepEqual(faceAt(snapshot, "runsout"), asFace(["gauge", "Runs out", null, "None", "No data for this view", null]));
  assert.deepEqual(faceAt(snapshot, "today").value, "None");
});

test("a figure is clamped and rounded once, and a reset beyond the view's window has no countdown", () => {
  const face = (percent, resetsAt, viewId = "week") => {
    const usage = parseUsage({ limits: [{ kind: "weekly_all", percent, resets_at: resetsAt }], five_hour: { utilization: percent, resets_at: resetsAt } });
    return buildFace({ state: "ok", usage, burnSamples: [] }, viewId, NOW);
  };
  const soon = new Date(NOW + 60 * MIN).toISOString();
  const parts = (shown) => [shown.value, shown.gauge.percent, shown.meta];
  assert.deepEqual(
    [parts(face(89.6, soon)), parts(face(-5, soon)), parts(face(1e21, "+275760-09-13T00:00:00Z")), face(50, new Date(NOW + 360 * MIN).toISOString(), "session").meta],
    [["90%", 90, "1h 0m"], ["0%", 0, "1h 0m"], ["999%", 999, null], null],
  );
});

test("burn says the reset comes first, or nothing once the week face shows 100%", () => {
  const rising = [sample(36, 18), sample(0, 21)];
  const soon = okSnapshot({ week: { percent: 21, resetsAtMs: NOW + 120 * MIN, label: "Week" } }, rising);
  assert.equal(buildFace(soon, "burn", NOW).sub, "Resets first");
  const full = okSnapshot({ week: { percent: 100, resetsAtMs: NOW + 120 * MIN, label: "Week" } }, rising);
  assert.equal(buildFace(full, "burn", NOW).sub, null);
  const shownFull = okSnapshot({ week: { percent: 99.5, resetsAtMs: NOW + 120 * MIN, label: "Week" } }, rising);
  assert.deepEqual([buildFace(shownFull, "week", NOW).value, buildFace(shownFull, "burn", NOW).sub], ["100%", null]);
});
