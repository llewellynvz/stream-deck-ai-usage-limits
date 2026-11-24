export const WEEK_MS = 604800000;
export const SESSION_MS = 18000000;
const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const BURN_WINDOW_MS = 3600000;
const BURN_MIN_SPAN_MS = 1800000;
const FORECAST_MIN_ELAPSED = 0.05;
const MAX_SHOWN_PERCENT = 999;
const MAX_KINDS = 12;

function parseTime(text) {
  const ms = typeof text === "string" ? Date.parse(text) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

function figure(percent, resetsAt, label) {
  if (!Number.isFinite(percent)) return null;
  return { percent: Math.min(Math.max(percent, 0), MAX_SHOWN_PERCENT), resetsAtMs: parseTime(resetsAt), label };
}

function validLimits(limits, kind) {
  return limits.filter((limit) => limit?.kind === kind && Number.isFinite(limit.percent));
}

function modelLabel(limit) {
  const name = limit.scope?.model?.display_name;
  return typeof name === "string" && name !== "" ? name : "Model";
}

function weekFigure(body, limits) {
  const [weekly] = validLimits(limits, "weekly_all");
  if (weekly) return figure(weekly.percent, weekly.resets_at, "Week");
  return figure(body?.seven_day?.utilization, body?.seven_day?.resets_at, "Week");
}

function modelFigure(limits) {
  const top = validLimits(limits, "weekly_scoped").reduce((best, limit) => (best && best.percent >= limit.percent ? best : limit), null);
  return top ? figure(top.percent, top.resets_at, modelLabel(top)) : null;
}

export function parseUsage(body) {
  const limits = Array.isArray(body?.limits) ? body.limits : [];
  return {
    week: weekFigure(body, limits),
    model: modelFigure(limits),
    session: figure(body?.five_hour?.utilization, body?.five_hour?.resets_at, "Session"),
  };
}

export function limitKinds(body) {
  const kinds = Array.isArray(body?.limits) ? body.limits.map((limit) => limit?.kind) : [];
  return kinds.filter((kind) => typeof kind === "string" && /^\w{1,40}$/.test(kind)).slice(0, MAX_KINDS);
}

export function elapsedFraction(resetsAtMs, windowMs, nowMs) {
  if (resetsAtMs === null) return null;
  return Math.min(Math.max(1 - (resetsAtMs - nowMs) / windowMs, 0), 1);
}

export function forecastPercent(limit, windowMs, nowMs) {
  const elapsed = elapsedFraction(limit.resetsAtMs, windowMs, nowMs);
  if (elapsed < FORECAST_MIN_ELAPSED) return null;
  return Math.min(Math.round(limit.percent / elapsed), MAX_SHOWN_PERCENT);
}

export function runOutMs(limit, nowMs) {
  const startMs = limit.resetsAtMs - WEEK_MS;
  return startMs + ((nowMs - startMs) * 100) / limit.percent;
}

export function sameWindow(before, after) {
  return Math.abs((before?.resetsAtMs ?? 0) - (after?.resetsAtMs ?? 0)) <= MINUTE_MS;
}

export function formatCountdown(ms) {
  if (ms <= 0) return "now";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function addBurnSample(samples, percent, nowMs) {
  const last = samples.at(-1);
  const recent = samples.filter((sample) => nowMs - sample.atMs <= BURN_WINDOW_MS);
  const restart = last && percent < last.percent;
  return [...(restart ? [] : recent), { atMs: nowMs, percent }];
}

export function burnState(samples) {
  const first = samples[0];
  const last = samples.at(-1);
  if (samples.length < 2 || last.atMs - first.atMs < BURN_MIN_SPAN_MS) return { kind: "measuring" };
  const perHour = (last.percent - first.percent) / ((last.atMs - first.atMs) / HOUR_MS);
  const rate = Math.min(Math.round(perHour), MAX_SHOWN_PERCENT);
  return rate >= 1 ? { kind: "rising", ratePerHour: rate } : { kind: "idle" };
}

export function msToFull(percent, ratePerHour) {
  return ((100 - percent) * HOUR_MS) / ratePerHour;
}
