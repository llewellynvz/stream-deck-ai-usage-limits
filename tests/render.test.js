import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFace } from "../com.psynalytics.claude-usage.sdPlugin/bin/faces.js";
import { renderFace, toDataUri } from "../com.psynalytics.claude-usage.sdPlugin/bin/render.js";
import { readSettings } from "../com.psynalytics.claude-usage.sdPlugin/bin/settings.js";
import { WEEK_MS } from "../com.psynalytics.claude-usage.sdPlugin/bin/usage-model.js";
import { ROWS, NOW, MIN, ZONE, LATE, SEEDED_CONTEXT, okSnapshot, sample } from "./rows.js";

const SIZES = { slot: [200, 100], key: [144, 144] };
const CHARTS = ["bar", "ring", "soft", "arc", "blocks", "columns"];
const LOOK = readSettings({});
const ALLOWED = new Set(["#12142D", "#008DA1", "#FFFFFF", "#F59E0B", "#EF4444", "none", "url(#soft)"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
const NARROW = new Set([..." ilt.:fjr1"]);
const LONG = "L".repeat(60);

const attr = (attrs, name) => attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
const faceOf = (name) => {
  const row = ROWS.find((candidate) => candidate.name === name);
  return buildFace(row.snapshot, row.viewId, NOW, { points: [], timeZone: ZONE });
};
const lookWith = (raw) => readSettings({ ...raw });
const drawnAt = (percent, chart) => {
  const snapshot = okSnapshot({ week: { percent, resetsAtMs: NOW + 0.5 * WEEK_MS, label: "Week" } });
  return renderFace(buildFace(snapshot, "week", NOW), "slot", lookWith({ chart }));
};

function textLines(svg) {
  return [...svg.matchAll(/<text ([^>]*)>(.*?)<\/text>/g)].map(([, attrs, inner]) => ({
    x: Number(attr(attrs, "x")),
    y: Number(attr(attrs, "y")),
    size: Number(attr(attrs, "font-size")),
    anchor: attr(attrs, "text-anchor") ?? "start",
    factor: attr(attrs, "font-weight") === "700" ? 0.62 : 0.56,
    text: inner.replace(/<[^>]+>/g, "").replace(/&(\w+);/g, (entity, name) => ENTITIES[name]),
  }));
}

function extent(line) {
  const ems = [...line.text].reduce((sum, char) => sum + (NARROW.has(char) ? 0.3 : line.factor), 0);
  const width = ems * line.size;
  const start = { start: line.x, middle: line.x - width / 2, end: line.x - width }[line.anchor];
  return [start, start + width];
}

function checkPair(a, b) {
  if (a.y !== b.y) return assert.ok(Math.abs(a.y - b.y) >= 14, `${a.text} and ${b.text} baselines too close`);
  const [left, right] = extent(a)[0] < extent(b)[0] ? [a, b] : [b, a];
  assert.ok(extent(left)[1] + 8 <= extent(right)[0], `${left.text} runs into ${right.text}`);
}

function checkFit(svg, [width, height], floor) {
  const lines = textLines(svg);
  for (const line of lines) {
    const [left, right] = extent(line);
    assert.ok(left >= 8 && right <= width - 8, `${line.text} runs from ${left} to ${right}`);
    assert.ok(line.y <= height - 8, `${line.text} baseline ${line.y} too low`);
  }
  lines.forEach((a, index) => lines.slice(index + 1).forEach((b) => checkPair(a, b)));
  for (const [, size] of svg.matchAll(/font-size="([\d.]+)"/g)) assert.ok(Number(size) >= floor, `font size ${size}`);
}

function stressFaces() {
  const late = okSnapshot({ week: { percent: 80, resetsAtMs: NOW + 0.94 * WEEK_MS, label: "Week" } });
  const steep = okSnapshot({}, [sample(30, 0), sample(0, 300)]);
  const long = okSnapshot({ model: { percent: 999, resetsAtMs: NOW + 9999 * MIN, label: LONG } });
  const trends = ["week", "model"].map((viewId) => buildFace(LATE, viewId, NOW, SEEDED_CONTEXT));
  return [buildFace(late, "week", NOW), buildFace(steep, "burn", NOW), buildFace(long, "model", NOW), ...trends];
}

function allFaces() {
  return [...ROWS.map((row) => faceOf(row.name)), ...stressFaces()];
}

function allSvgs() {
  return allFaces().flatMap((face) => [
    ...CHARTS.map((chart) => ["slot", renderFace(face, "slot", lookWith({ chart }))]),
    ["key", renderFace(face, "key", LOOK)],
  ]);
}

function barRects(svg) {
  return [...svg.matchAll(/<rect ([^>]*)\/>/g)].map(([, attrs]) => attrs).filter((attrs) => attr(attrs, "height") === "8");
}

test("server text is escaped and cut before it enters the SVG", () => {
  const face = faceOf("ok-model");
  const hostile = renderFace({ ...face, label: "<script>&" }, "slot", LOOK);
  assert.ok(hostile.includes(">&lt;script&gt;&amp;</text>"));
  assert.ok(!hostile.includes("<script>"));
  assert.ok(renderFace({ ...face, label: LONG }, "slot", LOOK).includes(`>${"L".repeat(10)}</text>`));
  assert.ok(renderFace({ ...face, label: LONG }, "key", LOOK).includes(`>${"L".repeat(9)}</text>`));
});

test("characters XML 1.0 forbids are dropped before escaping", () => {
  const svg = renderFace({ ...faceOf("ok-model"), label: "A\u0001\u001bB\u{FFFE}\uD800" }, "slot", LOOK);
  const forbidden = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u{D800}-\u{DFFF}\u{FFFE}\u{FFFF}]/u;
  assert.deepEqual([svg.includes(">AB</text>"), forbidden.test(svg)], [true, false]);
});

test("a colour setting that is not # and six hex digits falls back before it reaches the SVG", () => {
  const look = lookWith({ ground: "\"/><script>", bar: "#00ff00", text: "red" });
  for (const shape of ["slot", "key"]) {
    const svg = renderFace(faceOf("ok-week"), shape, look);
    assert.deepEqual([svg.includes("script"), svg.includes("fill=\"#12142D\""), svg.includes("#00ff00"), svg.includes("fill=\"#FFFFFF\"")], [false, true, true, true]);
    assert.ok(!svg.includes("radialGradient") && !svg.includes("width=\"1\""), "teal field and left line are gone");
  }
});

test("the bar turns amber at 75 and red at 90, and amber never sits above red", () => {
  const colourAt = (percent, look = LOOK) => {
    const face = buildFace(okSnapshot({ week: { percent, resetsAtMs: null, label: "Week" } }), "week", NOW);
    return attr(barRects(renderFace(face, "slot", look))[1], "fill");
  };
  assert.deepEqual([74, 75, 89, 90].map((percent) => colourAt(percent)), ["#008DA1", "#F59E0B", "#F59E0B", "#EF4444"]);
  assert.deepEqual([colourAt(89.6), colourAt(85, lookWith({ amberAt: 95, redAt: 80 }))], ["#EF4444", "#EF4444"]);
  assert.deepEqual([lookWith({ amberAt: "60", redAt: 300 }).amberAt, lookWith({ redAt: 300 }).redAt, lookWith({ amberAt: "x" }).amberAt], [60, 100, 75]);
});

test("auto-rotate waits 3 to 120 seconds, and a value that is not a number reads as 10", () => {
  assert.deepEqual([1, 500, "x", undefined].map((rotateSeconds) => lookWith({ rotateSeconds }).rotateSeconds), [3, 120, 10, 10]);
});

test("blocks light all sixteen only at 100, and at least one for any use above zero", () => {
  const litAt = (percent) => {
    const face = buildFace(okSnapshot({ week: { percent, resetsAtMs: null, label: "Week" } }), "week", NOW);
    const svg = renderFace(face, "slot", lookWith({ chart: "blocks" }));
    const blocks = [...svg.matchAll(/<rect ([^>]*)\/>/g)].map(([, attrs]) => attrs).filter((attrs) => attr(attrs, "height") === "12");
    return blocks.filter((attrs) => attr(attrs, "fill-opacity") === undefined).length;
  };
  assert.deepEqual([99, 1, 0, 100].map(litAt), [15, 1, 0, 16]);
});

test("each chart style draws its own shape, and a key always draws the bar", () => {
  const face = faceOf("ok-week");
  const marks = { bar: "width=\"172\" height=\"8\"", ring: "r=\"22.5\"", arc: "A30 30", blocks: "x=\"14\" y=\"76\" width=\"7\"", soft: "linearGradient", columns: "% today</text>" };
  for (const [chart, mark] of Object.entries(marks)) {
    const svg = renderFace(face, "slot", lookWith({ chart }));
    assert.deepEqual(Object.values(marks).filter((other) => svg.includes(other)), [mark], chart);
    assert.ok(renderFace(face, "key", lookWith({ chart })).includes("height=\"6\""), `key ${chart}`);
    const session = renderFace(faceOf("ok-session"), "slot", lookWith({ chart }));
    assert.ok(session.includes(["soft", "columns"].includes(chart) ? marks.bar : mark), `session ${chart}`);
  }
  assert.equal(barRects(renderFace(faceOf("ok-week"), "slot", LOOK))[1].match(/width="(\d+)"/)[1], "36");
  assert.equal(barRects(renderFace(faceOf("signin"), "slot", LOOK)).length, 0);
});

test("every style keeps the top row and draws its figure at x 14, baseline 67, size 40", () => {
  const topRow = ["x=\"37\" y=\"25\" font-size=\"14\"", "x=\"186\" y=\"25\" font-size=\"13\""];
  for (const chart of CHARTS) {
    const svg = renderFace(faceOf("ok-week"), "slot", lookWith({ chart }));
    assert.deepEqual(topRow.filter((part) => !svg.includes(part)), [], chart);
    assert.ok(svg.includes("<text x=\"14\" y=\"67\" font-size=\"40\" font-weight=\"700\""), chart);
  }
});

test("the ring, the arc and the soft chart say how much is left, and never less than 0% left", () => {
  for (const chart of ["ring", "arc", "soft"]) {
    assert.ok(drawnAt(21, chart).includes("<text x=\"14\" y=\"88\" font-size=\"13\" font-weight=\"500\" fill-opacity=\"0.65\">79% left</text>"), chart);
    assert.ok(drawnAt(120, chart).includes(">0% left</text>"), chart);
  }
});

test("the arc hand points along the share used from a hub at 152, 84, and is drawn at 0 too", () => {
  for (const percent of [21, 0]) {
    const angle = Math.PI * (1 - percent / 100);
    const [x, y] = [152 + 18 * Math.cos(angle), 84 - 18 * Math.sin(angle)].map((value) => value.toFixed(1));
    const svg = drawnAt(percent, "arc");
    assert.ok(svg.includes(`<line x1="152" y1="84" x2="${x}" y2="${y}"`) && svg.includes("<circle cx=\"152\" cy=\"84\" r=\"4\""), `${percent}`);
  }
});

test("blocks sit on whole pixels from x 14 to x 179, 7 wide", () => {
  const xs = [...drawnAt(21, "blocks").matchAll(/<rect x="([^"]*)" y="76" width="7"/g)].map((match) => match[1]);
  assert.deepEqual([xs.length, xs[0], xs.at(-1)], [16, "14", "179"]);
});

test("day columns keep a 9 pixel pitch and end at x 186 for a 7-day and an 8-day window", () => {
  const face = faceOf("ok-week");
  for (const [length, first] of [[7, 125], [8, 116]]) {
    const days = Array.from({ length }, (_, index) => ({ rise: index === length - 1 ? null : 5, today: false }));
    const svg = renderFace({ ...face, gauge: { ...face.gauge, trend: { ...face.gauge.trend, days } } }, "slot", lookWith({ chart: "columns" }));
    const spans = [...svg.matchAll(/<rect x="([^"]*)" y="[^"]*" width="([^"]*)"/g)].map(([, x, width]) => [Number(x), Number(x) + Number(width)]);
    assert.deepEqual([spans.length, spans[0][0], spans.at(-1)[1]], [length, first, 186], `${length} days`);
  }
});

test("the soft chart stays between x 110 and x 186", () => {
  const svg = renderFace(buildFace(LATE, "week", NOW, SEEDED_CONTEXT), "slot", lookWith({ chart: "soft" }));
  const xs = [...svg.matchAll(/<path d="([^"]*)" fill=/g)].flatMap(([, d]) => [...d.matchAll(/[ML]([\d.]+) /g)].map((match) => Number(match[1])));
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [110, 186]);
});

test("each shape carries its viewBox and a UTF-8 data URI", () => {
  const face = { ...faceOf("ok-model"), label: "Größe" };
  assert.ok(renderFace(face, "slot", LOOK).includes("viewBox=\"0 0 200 100\""));
  assert.ok(renderFace(face, "key", LOOK).includes("viewBox=\"0 0 144 144\""));
  for (const shape of ["slot", "key"]) {
    const svg = renderFace(face, shape, LOOK);
    const uri = toDataUri(svg);
    assert.ok(uri.startsWith("data:image/svg+xml;base64,"));
    assert.equal(Buffer.from(uri.split(",")[1], "base64").toString("utf8"), svg);
  }
});

test("only the default and warning colours appear in any output", () => {
  for (const [, svg] of allSvgs()) {
    const hex = svg.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
    const painted = [...svg.matchAll(/(?:fill|stroke|stop-color)="([^"]*)"/g)].map((match) => match[1]);
    for (const colour of [...hex, ...painted]) assert.ok(ALLOWED.has(colour), `colour ${colour}`);
  }
});

test("every text line fits its face in every style, including the widest figures and labels", () => {
  const stress = stressFaces();
  assert.deepEqual(stress.map((face) => face.value), ["80%", "600%", "999%", "61%", "40%"]);
  for (const [shape, svg] of allSvgs()) checkFit(svg, SIZES[shape], shape === "key" ? 14 : 12);
});
