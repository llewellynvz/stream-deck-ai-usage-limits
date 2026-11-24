import { text, line, icon, label, figure, topRow, track, levelColour, RED } from "./svg-parts.js";
import { barStyle, ringStyle, arcStyle, blocksStyle } from "./gauges.js";
import { softStyle, columnsStyle } from "./trend-charts.js";

const STYLES = { bar: barStyle, ring: ringStyle, soft: softStyle, arc: arcStyle, blocks: blocksStyle, columns: columnsStyle };
const TREND_CHARTS = new Set(["soft", "columns"]);
const KEY_SOFT = " fill-opacity=\"0.92\" letter-spacing=\"0.2\"";
const SUB_LINE_CHARS = 15;
const KEY_WORD_WIDTH = 112;

function dot(face, look) {
  if (face.dot === null) return "";
  return `<circle cx="180" cy="56" r="5" fill="${face.dot === "warn" ? RED : look.bar}"/>`;
}

function slotWords(face, look) {
  return [
    topRow(face),
    line(14, 62, 28, 700, face.value, " letter-spacing=\"-0.3\""),
    line(14, 84, 13, 400, face.sub, " fill-opacity=\"0.75\""),
    dot(face, look),
  ].join("");
}

function slotFace(face, look) {
  if (face.gauge === null) return slotWords(face, look);
  const chart = face.gauge.trend === null && TREND_CHARTS.has(look.chart) ? "bar" : look.chart;
  return STYLES[chart](face, look);
}

function wrapWords(value) {
  const lines = [];
  for (const word of value.split(" ")) {
    const joined = lines.length > 0 ? `${lines.at(-1)} ${word}` : word;
    if (lines.length > 0 && joined.length <= SUB_LINE_CHARS) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines.slice(0, 2);
}

function keyWords(face) {
  const size = Math.min(26, Math.floor(KEY_WORD_WIDTH / (0.62 * Array.from(face.value).length)));
  const sub = face.sub === null ? [] : wrapWords(face.sub);
  return [
    line(16, 72, size, 700, face.value),
    ...sub.map((part, index) => line(16, 94 + index * 16, 14, 400, part, KEY_SOFT)),
  ].join("");
}

function keyBar(face, look) {
  const used = Math.round((Math.min(face.gauge.percent, 100) / 100) * 112);
  return [
    figure(16, 88, 48, face.value),
    `<rect x="16" y="102" width="112" height="6" rx="3" ${track(look)}/>`,
    `<rect x="16" y="102" width="${used}" height="6" rx="3" fill="${levelColour(face.gauge.percent, look)}"/>`,
  ].join("");
}

function keyFace(face, look) {
  return [
    icon(face.icon, 16, 15, 20),
    text(42, 31, 18, 500, label(face.label, 9), KEY_SOFT),
    line(16, 130, 15, 500, face.meta, KEY_SOFT),
    face.gauge === null ? keyWords(face) : keyBar(face, look),
  ].join("");
}

export function renderFace(face, shapeName, look) {
  const [width, height, corner] = shapeName === "slot" ? [200, 100, 0] : [144, 144, 18];
  const size = `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} font-family="Inter, sans-serif" fill="${look.text}">`,
    `<rect width="${width}" height="${height}" rx="${corner}" fill="${look.ground}"/>`,
    shapeName === "slot" ? slotFace(face, look) : keyFace(face, look),
    "</svg>",
  ].join("");
}

export function toDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
