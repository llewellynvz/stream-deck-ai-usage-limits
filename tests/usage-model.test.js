import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseUsage,
  limitKinds,
  elapsedFraction,
  forecastPercent,
  formatCountdown,
  addBurnSample,
  burnState,
  msToFull,
  WEEK_MS,
  SESSION_MS,
} from "../com.psynalytics.claude-usage.sdPlugin/bin/usage-model.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/usage-2026-11-23.json", import.meta.url), "utf8"));
const MIN = 60000;
const NOW = 1800000000000;

function samples(...points) {
  return points.reduce((list, [percent, minute]) => addBurnSample(list, percent, minute * MIN), []);
}

test("the captured response gives week 26, the scoped model at 24 and no session", () => {
  const usage = parseUsage(fixture);
  assert.deepEqual(usage.week, { percent: 26, resetsAtMs: Date.parse(fixture.limits[0].resets_at), label: "Week" });
  const label = fixture.limits[1].scope.model.display_name;
  assert.deepEqual(usage.model, { percent: 24, resetsAtMs: Date.parse(fixture.limits[1].resets_at), label });
  assert.equal(usage.session, null);
  assert.deepEqual(limitKinds(fixture), ["weekly_all", "weekly_scoped"]);
});

test("a legacy body without limits reads seven_day and five_hour", () => {
  const usage = parseUsage({
    seven_day: { utilization: 21, resets_at: "2026-11-29T05:00:00+00:00" },
    five_hour: { utilization: 64, resets_at: "2026-11-23T20:00:00+00:00" },
  });
  assert.deepEqual(usage.week, { percent: 21, resetsAtMs: Date.parse("2026-11-29T05:00:00+00:00"), label: "Week" });
  assert.deepEqual(usage.session, { percent: 64, resetsAtMs: Date.parse("2026-11-23T20:00:00+00:00"), label: "Session" });
  assert.equal(usage.model, null);
});

test("bad shapes give null or a figure without a reset time and never throw", () => {
  assert.equal(parseUsage({ limits: "x" }).week, null);
  assert.equal(parseUsage({ limits: [{ kind: "weekly_all", percent: "21" }] }).week, null);
  const soon = parseUsage({ limits: [{ kind: "weekly_all", percent: 21, resets_at: "soon" }] });
  assert.deepEqual(soon.week, { percent: 21, resetsAtMs: null, label: "Week" });
  assert.deepEqual(parseUsage(null), { week: null, model: null, session: null });
  assert.deepEqual(parseUsage({ limits: [{ kind: "monthly_new", percent: 5 }] }), { week: null, model: null, session: null });
  assert.equal(parseUsage({ limits: [{ kind: "weekly_scoped", percent: 5, scope: null }] }).model.label, "Model");
  const idle = parseUsage({ five_hour: { utilization: 0, resets_at: null } });
  assert.deepEqual(idle.session, { percent: 0, resetsAtMs: null, label: "Session" });
});

test("the model is the scoped limit with the highest percent", () => {
  const scoped = (percent, name) => ({ kind: "weekly_scoped", percent, scope: { model: { display_name: name } } });
  const usage = parseUsage({ limits: [scoped(10, "M1"), scoped(95, "M2"), scoped("99", "M3")] });
  assert.deepEqual([usage.model.percent, usage.model.label], [95, "M2"]);
});

test("limit kinds keep at most 12 strings of 1 to 40 word characters", () => {
  const words = Array.from({ length: 13 }, (_, index) => `kind_${index}`);
  const kinds = ["weekly_all\nstate ok", "k".repeat(41), "", 7, ...words];
  assert.deepEqual(limitKinds({ limits: kinds.map((kind) => ({ kind })) }), words.slice(0, 12));
});

test("elapsed share is clamped and null without a reset time", () => {
  assert.equal(elapsedFraction(null, WEEK_MS, NOW), null);
  assert.equal(elapsedFraction(NOW + 2 * WEEK_MS, WEEK_MS, NOW), 0);
  assert.equal(elapsedFraction(NOW - 1, SESSION_MS, NOW), 1);
});

test("forecast divides use by the elapsed share and waits for the first 5 percent", () => {
  const at = (percent, elapsed) => forecastPercent({ percent, resetsAtMs: NOW + (1 - elapsed) * WEEK_MS }, WEEK_MS, NOW);
  assert.equal(at(21, 0.21), 100);
  assert.equal(at(21, 0.04), null);
  assert.equal(at(80, 0.06), 999);
});

test("countdown text", () => {
  assert.equal(formatCountdown(480600000), "5d 13h");
  assert.equal(formatCountdown(47100000), "13h 5m");
  assert.equal(formatCountdown(2520000), "42m");
  assert.equal(formatCountdown(-5), "now");
});

test("burn rate over the last hour", () => {
  assert.deepEqual(burnState(samples([21, 0], [24, 36])), { kind: "rising", ratePerHour: 5 });
  assert.deepEqual(burnState(samples([21, 0])), { kind: "measuring" });
  assert.deepEqual(burnState(samples([21, 0], [24, 5])), { kind: "measuring" });
  assert.deepEqual(burnState(samples([21, 0], [21, 60])), { kind: "idle" });
  assert.equal(samples([97, 0], [2, 5]).length, 1);
  assert.equal(samples([21, 0], [22, 61]).length, 1);
  const before = samples([21, 0]);
  addBurnSample(before, 22, MIN);
  assert.equal(before.length, 1);
  assert.equal(msToFull(24, 5), 54720000);
});

test("burn waits for samples 30 minutes apart", () => {
  const measured = [burnState(samples([21, 0], [22, 29])), burnState(samples([21, 0], [22, 30]))];
  assert.deepEqual(measured, [{ kind: "measuring" }, { kind: "rising", ratePerHour: 2 }]);
});
