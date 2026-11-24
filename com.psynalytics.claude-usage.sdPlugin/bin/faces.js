import {
  WEEK_MS,
  SESSION_MS,
  forecastPercent,
  formatCountdown,
  burnState,
  msToFull,
  runOutMs,
} from "./usage-model.js";
import { dayRises, todayFigures, clockText } from "./history.js";

export const VIEWS = ["week", "model", "burn", "runsout", "today", "session"];
const ICON_OF = { week: "calendar-dots", model: "cpu", burn: "fire", runsout: "gauge", today: "calendar-dots", session: "timer" };
const LABEL_OF = { week: "Week", model: "Model", burn: "Burn", runsout: "Runs out", today: "Today", session: "Session" };
const SIGN_IN = { icon: "sign-in", label: "Account", meta: null, value: "Sign in", sub: "Open Claude Code once", dot: null, gauge: null };
const OFFLINE = { icon: "warning-circle", label: "Usage", meta: null, value: "Offline", sub: "Will retry", dot: null, gauge: null };
const NO_CONTEXT = { points: [], timeZone: undefined };
const resetKnown = (usage) => Boolean(usage.week) && usage.week.resetsAtMs !== null;
const NEEDS = {
  week: (usage) => Boolean(usage.week),
  model: (usage) => Boolean(usage.model),
  burn: (usage) => Boolean(usage.week),
  runsout: resetKnown,
  today: resetKnown,
  session: (usage) => Boolean(usage.session),
};

function plainFace(viewId, value, sub, meta = null, dot = null) {
  return { icon: ICON_OF[viewId], label: LABEL_OF[viewId], meta, value, sub, dot, gauge: null };
}

function trendPoints(limit, field, nowMs, context) {
  const startMs = limit.resetsAtMs - WEEK_MS;
  const stored = context.points.filter((point) => point[field] !== null && point.atMs >= startMs && point.atMs < nowMs);
  return [...stored.map((point) => ({ atMs: point.atMs, percent: point[field] })), { atMs: nowMs, percent: limit.percent }];
}

function trendOf(limit, field, nowMs, context) {
  if (limit.resetsAtMs === null || limit.resetsAtMs - nowMs > WEEK_MS) return null;
  const startMs = limit.resetsAtMs - WEEK_MS;
  const points = trendPoints(limit, field, nowMs, context);
  const days = dayRises(points, startMs, limit.resetsAtMs, nowMs, context.timeZone);
  const todayRise = Math.round(days.find((day) => day.today)?.rise ?? 0);
  const forecast = forecastPercent(limit, WEEK_MS, nowMs);
  return { startMs, endMs: limit.resetsAtMs, points, forecast, days, todayText: `${todayRise}% today` };
}

function limitFace(viewId, limit, windowMs, nowMs, context) {
  const { resetsAtMs } = limit;
  const shown = Math.round(limit.percent);
  const trend = viewId === "session" ? null : trendOf(limit, viewId, nowMs, context);
  return {
    ...plainFace(viewId, `${shown}%`, null),
    label: limit.label,
    meta: resetsAtMs === null || resetsAtMs - nowMs > windowMs ? null : formatCountdown(resetsAtMs - nowMs),
    gauge: { percent: shown, trend },
  };
}

function fullNote(week, ratePerHour, nowMs) {
  if (Math.round(week.percent) >= 100) return null;
  const toFullMs = msToFull(week.percent, ratePerHour);
  if (week.resetsAtMs !== null && week.resetsAtMs - nowMs < toFullMs) return "Resets first";
  return `Full in ${formatCountdown(toFullMs)}`;
}

function burnFace(snapshot, nowMs) {
  const { week } = snapshot.usage;
  const burn = burnState(snapshot.burnSamples);
  if (burn.kind === "measuring") return plainFace("burn", "Wait", "Measuring", "per hour");
  if (burn.kind === "idle") return plainFace("burn", "Idle", "No rise measured", "per hour");
  return plainFace("burn", `${burn.ratePerHour}%`, fullNote(week, burn.ratePerHour, nowMs), "per hour");
}

function runsOutFace(snapshot, nowMs, context) {
  const { week } = snapshot.usage;
  const shown = Math.round(week.percent);
  const face = (value, sub, dot = null) => plainFace("runsout", value, sub, "at this pace", dot);
  if (shown >= 100) return face("Now", "Limit reached");
  if (shown === 0) return face("Lasts", "No usage yet");
  const forecast = forecastPercent(week, WEEK_MS, nowMs);
  if (forecast === null) return face("Early", "Too early to say");
  const outMs = runOutMs(week, nowMs);
  if (outMs >= week.resetsAtMs) return face("Lasts", `Ends the week near ${Math.min(forecast, 99)}%`, "bar");
  return face(clockText(outMs, context.timeZone, true), `${formatCountdown(week.resetsAtMs - outMs)} before the reset`, "warn");
}

function todayFace(snapshot, nowMs, context) {
  const { week } = snapshot.usage;
  const points = trendPoints(week, "week", nowMs, context);
  const today = todayFigures(points, week.resetsAtMs - WEEK_MS, week.resetsAtMs, nowMs, context.timeZone);
  const sub = today.left >= 0 ? `${today.left}% left for today` : `Over by ${-today.left}%`;
  const meta = today.sinceMs === null ? `safe ${today.allowance}% a day` : `since ${clockText(today.sinceMs, context.timeZone, false)}`;
  return plainFace("today", `${today.used}% used`, sub, meta);
}

const BUILDERS = {
  week: (snapshot, nowMs, context) => limitFace("week", snapshot.usage.week, WEEK_MS, nowMs, context),
  model: (snapshot, nowMs, context) => limitFace("model", snapshot.usage.model, WEEK_MS, nowMs, context),
  session: (snapshot, nowMs, context) => limitFace("session", snapshot.usage.session, SESSION_MS, nowMs, context),
  burn: burnFace,
  runsout: runsOutFace,
  today: todayFace,
};

export function hasData(snapshot, viewId) {
  return snapshot.state === "ok" && NEEDS[viewId](snapshot.usage);
}

export function buildFace(snapshot, viewId, nowMs, context = NO_CONTEXT) {
  if (snapshot.state === "signin") return SIGN_IN;
  if (snapshot.state === "offline") return OFFLINE;
  if (snapshot.state === "loading") return plainFace(viewId, "Loading", null);
  if (!hasData(snapshot, viewId)) return plainFace(viewId, "None", "No data for this view");
  return BUILDERS[viewId](snapshot, nowMs, context);
}
