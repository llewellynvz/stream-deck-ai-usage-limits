import { figure, topRow, track, levelColour, leftCaption } from "./svg-parts.js";

const RING = 2 * Math.PI * 22.5;
const ARC = Math.PI * 30;
const RING_AT = "cx=\"160\" cy=\"62\" r=\"22.5\" fill=\"none\" stroke-width=\"7\"";
const ARC_AT = "d=\"M122 84 A30 30 0 0 1 182 84\" fill=\"none\" stroke-width=\"8\" stroke-linecap=\"round\"";

function share(face) {
  return Math.min(face.gauge.percent, 100) / 100;
}

function dash(face, length) {
  return `stroke-dasharray="${(share(face) * length).toFixed(1)} ${length.toFixed(1)}"`;
}

export function barStyle(face, look) {
  return [
    topRow(face),
    figure(14, 67, 40, face.value),
    `<rect x="14" y="80" width="172" height="8" rx="4" ${track(look)}/>`,
    `<rect x="14" y="80" width="${Math.round(share(face) * 172)}" height="8" rx="4" fill="${levelColour(face.gauge.percent, look)}"/>`,
  ].join("");
}

export function ringStyle(face, look) {
  const colour = levelColour(face.gauge.percent, look);
  const progress = `<circle ${RING_AT} stroke="${colour}" stroke-linecap="round" ${dash(face, RING)} transform="rotate(-90 160 62)"/>`;
  return [
    topRow(face),
    figure(14, 67, 40, face.value),
    leftCaption(face),
    `<circle ${RING_AT} stroke="${look.text}" stroke-opacity="0.12"/>`,
    share(face) > 0 ? progress : "",
  ].join("");
}

export function arcStyle(face, look) {
  const progress = `<path ${ARC_AT} stroke="${levelColour(face.gauge.percent, look)}" ${dash(face, ARC)}/>`;
  const angle = Math.PI * (1 - share(face));
  const [x, y] = [152 + 18 * Math.cos(angle), 84 - 18 * Math.sin(angle)].map((value) => value.toFixed(1));
  return [
    topRow(face),
    figure(14, 67, 40, face.value),
    leftCaption(face),
    `<path ${ARC_AT} stroke="${look.text}" stroke-opacity="0.12"/>`,
    share(face) > 0 ? progress : "",
    `<line x1="152" y1="84" x2="${x}" y2="${y}" stroke="${look.text}" stroke-width="2.5" stroke-linecap="round"/>`,
    `<circle cx="152" cy="84" r="4" fill="${look.text}"/>`,
  ].join("");
}

export function blocksStyle(face, look) {
  const { percent } = face.gauge;
  const lit = percent >= 100 ? 16 : Math.min(Math.max(Math.round(share(face) * 16), percent > 0 ? 1 : 0), 15);
  const colour = `fill="${levelColour(face.gauge.percent, look)}"`;
  const blocks = Array.from({ length: 16 }, (_, index) => `<rect x="${14 + index * 11}" y="76" width="7" height="12" rx="2" ${index < lit ? colour : track(look)}/>`);
  return topRow(face) + figure(14, 67, 40, face.value) + blocks.join("");
}
