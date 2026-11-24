import { VIEWS } from "./faces.js";

const CHARTS = ["bar", "ring", "soft", "arc", "blocks", "columns"];
const DEFAULT_COLOURS = { ground: "#12142D", bar: "#008DA1", text: "#FFFFFF" };

function colour(value, fallback) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

function whole(value, min, max, fallback) {
  const number = typeof value === "string" && /^\d{1,3}$/.test(value) ? Number(value) : value;
  return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), min), max) : fallback;
}

function viewOf(value) {
  const id = value === "forecast" ? "runsout" : value;
  return VIEWS.includes(id) ? id : "week";
}

export function readSettings(raw) {
  const redAt = whole(raw?.redAt, 0, 100, 90);
  return {
    view: viewOf(raw?.view),
    chart: CHARTS.includes(raw?.chart) ? raw.chart : "bar",
    ground: colour(raw?.ground, DEFAULT_COLOURS.ground),
    bar: colour(raw?.bar, DEFAULT_COLOURS.bar),
    text: colour(raw?.text, DEFAULT_COLOURS.text),
    amberAt: Math.min(whole(raw?.amberAt, 0, 100, 75), redAt),
    redAt,
    rotate: raw?.rotate === true,
    rotateSeconds: whole(raw?.rotateSeconds, 3, 120, 10),
  };
}

export function withoutColours(raw) {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !(key in DEFAULT_COLOURS)));
}
