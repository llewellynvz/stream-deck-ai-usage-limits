const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const MAX_WINDOWS = 3;
const MAX_POINTS = 200;
const PARTS = { hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" };

export function windowKey(resetsAtMs) {
  return Math.round(resetsAtMs / MINUTE_MS);
}

function isPercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 999;
}

function isPoint(point) {
  return Number.isFinite(point?.atMs) && isPercent(point.week) && (point.model === null || isPercent(point.model));
}

function readWindow(window) {
  if (!Number.isSafeInteger(window?.key) || !Array.isArray(window.points)) return [];
  const points = window.points.filter(isPoint).map(({ atMs, week, model }) => ({ atMs, week, model }));
  return [{ key: window.key, points: points.sort((a, b) => a.atMs - b.atMs).slice(-MAX_POINTS) }];
}

export function readStored(value) {
  return Array.isArray(value) ? value.slice(0, MAX_WINDOWS).flatMap(readWindow) : [];
}

export function addPoint(windows, key, point) {
  const found = windows.find((window) => window.key === key) ?? { key, points: [] };
  const kept = found.points.filter((stored) => stored.atMs <= point.atMs);
  const last = kept.at(-1);
  if (last && Math.floor(last.atMs / HOUR_MS) >= Math.floor(point.atMs / HOUR_MS)) return windows;
  const points = [...kept, point].slice(-MAX_POINTS);
  return [{ key, points }, ...windows.filter((window) => window.key !== key)].slice(0, MAX_WINDOWS);
}

function record(state, usage, atMs) {
  const week = usage?.week;
  if (state.windows === null || !week || week.resetsAtMs === null || !Number.isFinite(atMs)) return;
  const point = { atMs, week: week.percent, model: usage.model?.percent ?? null };
  const next = addPoint(state.windows, windowKey(week.resetsAtMs), point);
  if (next === state.windows) return;
  state.windows = next;
  return state.save({ history: next });
}

function pointsFor(state, week) {
  if (state.windows === null || !week || week.resetsAtMs === null) return [];
  return state.windows.find((window) => window.key === windowKey(week.resetsAtMs))?.points ?? [];
}

export function createHistory(save) {
  const state = { save, windows: null };
  return {
    load: (stored) => {
      state.windows ??= readStored(stored?.history);
    },
    record: (usage, atMs) => record(state, usage, atMs),
    points: (week) => pointsFor(state, week),
  };
}

function zoneWall(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { ...PARTS, timeZone }).formatToParts(ms);
  const part = (type) => Number(parts.find((entry) => entry.type === type).value);
  const day = Date.UTC(part("year"), part("month") - 1, part("day"));
  return { day, offset: day + ((part("hour") * 60 + part("minute")) * 60 + part("second")) * 1000 - Math.floor(ms / 1000) * 1000 };
}

export function dayStart(ms, timeZone) {
  const { day, offset } = zoneWall(ms, timeZone);
  return day - zoneWall(day - offset, timeZone).offset;
}

export function clockText(ms, timeZone, withDay) {
  const day = withDay ? { weekday: "short" } : {};
  return new Intl.DateTimeFormat("en-GB", { ...day, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(ms);
}

function valueAt(points, atMs) {
  return points.findLast((point) => point.atMs <= atMs) ?? null;
}

function baseline(points, startMs, windowStartMs) {
  const before = valueAt(points, startMs);
  if (before) return { ...before, since: false };
  if (windowStartMs >= startMs) return { atMs: windowStartMs, percent: 0, since: false };
  return points.length > 0 ? { ...points[0], since: true } : null;
}

function riseBetween(points, startMs, endMs, windowStartMs) {
  const base = baseline(points, startMs, windowStartMs);
  const last = valueAt(points, endMs);
  if (!base || !last || last.atMs < base.atMs) return null;
  return Math.max(last.percent - base.percent, 0);
}

export function dayRises(points, windowStartMs, resetMs, nowMs, timeZone) {
  const starts = [];
  for (let day = dayStart(windowStartMs, timeZone); day < resetMs; day = dayStart(day + 30 * HOUR_MS, timeZone)) starts.push(day);
  return starts.map((startMs, index) => {
    const endMs = starts[index + 1] ?? resetMs;
    const rise = startMs > nowMs ? null : riseBetween(points, startMs, Math.min(endMs, nowMs), windowStartMs);
    return { rise, today: startMs <= nowMs && nowMs < endMs };
  });
}

export function todayFigures(points, windowStartMs, resetMs, nowMs, timeZone) {
  const base = baseline(points, dayStart(nowMs, timeZone), windowStartMs);
  const used = Math.round(Math.max(points.at(-1).percent - base.percent, 0));
  const days = Math.max((resetMs - base.atMs) / DAY_MS, 1);
  const allowance = Math.round(Math.max(100 - base.percent, 0) / days);
  return { used, allowance, left: allowance - used, sinceMs: base.since ? base.atMs : null };
}
