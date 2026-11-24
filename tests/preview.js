import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { buildFace } from "../com.psynalytics.claude-usage.sdPlugin/bin/faces.js";
import { renderFace } from "../com.psynalytics.claude-usage.sdPlugin/bin/render.js";
import { readSettings } from "../com.psynalytics.claude-usage.sdPlugin/bin/settings.js";
import { ROWS, NOW, ZONE, LATE, SEEDED_CONTEXT, lateAt } from "./rows.js";

const folder = new URL("../_preview/", import.meta.url);
const write = (name, face, shape = "slot", raw = {}) => writeFileSync(new URL(`${name}.svg`, folder), renderFace(face, shape, readSettings(raw)));
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
for (const row of ROWS) {
  const face = buildFace(row.snapshot, row.viewId, NOW, { points: [], timeZone: ZONE });
  for (const shape of ["slot", "key"]) write(`${row.name}-${shape}`, face, shape);
}
for (const chart of ["bar", "ring", "soft", "arc", "blocks", "columns"]) write(`style-${chart}`, buildFace(LATE, "week", NOW, SEEDED_CONTEXT), "slot", { chart });
for (const percent of [41, 72, 93]) write(`level-${percent}`, buildFace(lateAt(percent), "week", NOW, SEEDED_CONTEXT));
write("today-seeded", buildFace(LATE, "today", NOW, SEEDED_CONTEXT));
console.log(`wrote ${ROWS.length * 2 + 10} previews`);
