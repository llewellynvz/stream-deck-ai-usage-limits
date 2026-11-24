import { ICONS } from "./icons.js";

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" };
const NOT_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u{D800}-\u{DFFF}\u{FFFE}\u{FFFF}]/gu;
const AMBER = "#F59E0B";
export const RED = "#EF4444";

export function escapeXml(value) {
  return value.replace(NOT_XML_CHARS, "").replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

export function text(x, y, size, weight, content, extra = "") {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${extra}>${content}</text>`;
}

export function line(x, y, size, weight, value, extra = "") {
  return value === null ? "" : text(x, y, size, weight, escapeXml(value), extra);
}

export function icon(iconId, x, y, size) {
  const [duotone, outline] = ICONS[iconId];
  return `<g transform="translate(${x} ${y}) scale(${size / 256})"><path d="${duotone}" opacity="0.2"/><path d="${outline}"/></g>`;
}

export function label(value, max) {
  return escapeXml(Array.from(value).slice(0, max).join(""));
}

export function figure(x, y, size, value) {
  const percent = `<tspan font-size="${Math.round(size / 2)}" dx="2" fill-opacity="0.7">%</tspan>`;
  return text(x, y, size, 700, `${escapeXml(value.slice(0, -1))}${percent}`, " letter-spacing=\"-0.5\"");
}

export function topRow(face) {
  return [
    icon(face.icon, 14, 11, 17),
    text(37, 25, 14, 500, label(face.label, 10), " fill-opacity=\"0.9\""),
    line(186, 25, 13, 500, face.meta, " text-anchor=\"end\" fill-opacity=\"0.65\""),
  ].join("");
}

export function caption(value) {
  return line(14, 88, 13, 500, value, " fill-opacity=\"0.65\"");
}

export function leftCaption(face) {
  return caption(`${Math.max(100 - face.gauge.percent, 0)}% left`);
}

export function track(look) {
  return `fill="${look.text}" fill-opacity="0.12"`;
}

export function levelColour(percent, look) {
  if (percent >= look.redAt) return RED;
  return percent >= look.amberAt ? AMBER : look.bar;
}
