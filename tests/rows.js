import { readFileSync } from "node:fs";
import { WEEK_MS } from "../com.psynalytics.claude-usage.sdPlugin/bin/usage-model.js";

export const NOW = Date.parse("2026-11-23T16:35:00Z");
export const MIN = 60000;
export const ZONE = "Europe/Amsterdam";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/usage-2026-11-23.json", import.meta.url), "utf8"));
export const MODEL_LABEL = fixture.limits[1].scope.model.display_name;
const RESET = NOW + 0.79 * WEEK_MS;
const LATE_RESET = NOW + 0.45 * WEEK_MS;

export function okSnapshot(usage = {}, burnSamples = []) {
  const base = {
    week: { percent: 21, resetsAtMs: RESET, label: "Week" },
    model: { percent: 24, resetsAtMs: RESET, label: MODEL_LABEL },
    session: { percent: 64, resetsAtMs: NOW + 108 * MIN, label: "Session" },
  };
  return { state: "ok", usage: { ...base, ...usage }, burnSamples };
}

export function sample(minutesAgo, percent) {
  return { atMs: NOW - minutesAgo * MIN, percent };
}

function stateSnapshot(state) {
  return { state, usage: null, burnSamples: [] };
}

const early = { percent: 3, resetsAtMs: NOW + 0.97 * WEEK_MS, label: "Week" };
const late = (percent) => ({ week: { percent, resetsAtMs: LATE_RESET, label: "Week" }, model: { percent: 40, resetsAtMs: LATE_RESET, label: MODEL_LABEL } });
const RISE = [0, 3, 3, 9, 12, 12, 12, 20, 27, 27, 31, 31, 31, 40, 48, 48, 52, 52, 52, 58, 60];
export const SEEDED = RISE.map((week, step) => ({ atMs: LATE_RESET - WEEK_MS + step * 270 * MIN, week, model: Math.round(week * 0.65) }));
export const SEEDED_CONTEXT = { points: SEEDED, timeZone: ZONE };
export const LATE = okSnapshot(late(61));
export const lateAt = (percent) => okSnapshot(late(percent));

export const ROWS = [
  { name: "ok-week", viewId: "week", snapshot: okSnapshot() },
  { name: "ok-model", viewId: "model", snapshot: okSnapshot() },
  { name: "ok-burn-rising", viewId: "burn", snapshot: okSnapshot({}, [sample(36, 18), sample(0, 21)]) },
  { name: "ok-burn-idle", viewId: "burn", snapshot: okSnapshot({}, [sample(60, 21), sample(0, 21)]) },
  { name: "ok-burn-measuring", viewId: "burn", snapshot: okSnapshot({}, [sample(0, 21)]) },
  { name: "ok-runsout", viewId: "runsout", snapshot: okSnapshot() },
  { name: "ok-runsout-early", viewId: "runsout", snapshot: okSnapshot({ week: early }) },
  { name: "ok-runsout-soon", viewId: "runsout", snapshot: LATE },
  { name: "ok-today", viewId: "today", snapshot: okSnapshot() },
  { name: "ok-session", viewId: "session", snapshot: okSnapshot() },
  { name: "ok-no-data", viewId: "session", snapshot: okSnapshot({ session: null }) },
  { name: "signin", viewId: "week", snapshot: stateSnapshot("signin") },
  { name: "offline", viewId: "week", snapshot: stateSnapshot("offline") },
  { name: "loading", viewId: "week", snapshot: stateSnapshot("loading") },
];
