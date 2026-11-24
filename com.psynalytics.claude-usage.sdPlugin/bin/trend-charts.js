import { figure, topRow, track, levelColour, caption, leftCaption } from "./svg-parts.js";

function fixed(value) {
  return value.toFixed(1);
}

function chartY(percent) {
  return 87 - Math.min(percent, 100) * 0.49;
}

function chartPoints(trend) {
  const width = trend.endMs - trend.startMs;
  return trend.points.map((point) => [110 + ((point.atMs - trend.startMs) / width) * 76, chartY(point.percent)]);
}

function heading(trend, [x, y], look) {
  if (trend.forecast === null) return "";
  const to = `L186 ${fixed(chartY(trend.forecast))}`;
  return `<path d="M${fixed(x)} ${fixed(y)} ${to}" fill="none" stroke="${look.text}" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="3 4"/>`;
}

export function softStyle(face, look) {
  const { trend } = face.gauge;
  const colour = levelColour(face.gauge.percent, look);
  const xy = chartPoints(trend);
  const path = xy.map(([x, y], index) => `${index === 0 ? "M" : "L"}${fixed(x)} ${fixed(y)}`).join(" ");
  const [lastX, lastY] = xy.at(-1);
  const stop = (offset, opacity) => `<stop offset="${offset}" stop-color="${colour}" stop-opacity="${opacity}"/>`;
  return [
    `<defs><linearGradient id="soft" x1="0" y1="0" x2="0" y2="1">${stop(0, 0.5)}${stop(1, 0.04)}</linearGradient></defs>`,
    `<path d="${path} L${fixed(lastX)} 87 L${fixed(xy[0][0])} 87 Z" fill="url(#soft)"/>`,
    `<path d="${path}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
    heading(trend, xy.at(-1), look),
    `<circle cx="${fixed(lastX)}" cy="${fixed(lastY)}" r="3.5" fill="${look.text}" stroke="${look.ground}" stroke-width="1.5"/>`,
    `<rect x="110" y="87" width="76" height="1" ${track(look)}/>`,
    topRow(face),
    figure(14, 67, 40, face.value),
    leftCaption(face),
  ].join("");
}

function column(day, x, colour, look) {
  const rise = Math.round(day.rise ?? 0);
  if (rise === 0) return `<rect x="${x}" y="85" width="7" height="3" rx="1.5" ${track(look)}/>`;
  const height = Math.min(Math.max(Math.round(rise * 2.4), 3), 52);
  return `<rect x="${x}" y="${88 - height}" width="7" height="${height}" rx="2" fill="${colour}" fill-opacity="${day.today ? 1 : 0.5}"/>`;
}

export function columnsStyle(face, look) {
  const { days, todayText } = face.gauge.trend;
  const colour = levelColour(face.gauge.percent, look);
  const first = 186 - (days.length * 9 - 2);
  return [
    topRow(face),
    figure(14, 67, 40, face.value),
    caption(todayText),
    ...days.map((day, index) => column(day, first + index * 9, colour, look)),
  ].join("");
}
