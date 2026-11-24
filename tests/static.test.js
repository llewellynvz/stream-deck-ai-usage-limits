import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readSettings } from "../com.psynalytics.claude-usage.sdPlugin/bin/settings.js";

const PLUGIN = new URL("../com.psynalytics.claude-usage.sdPlugin/", import.meta.url);
const BIN_FILES = ["credentials.js", "deck.js", "faces.js", "gauges.js", "history.js", "icons.js", "plugin.js", "poller.js", "quiet-log.js", "render.js", "settings.js", "svg-parts.js", "trend-charts.js", "usage-client.js", "usage-model.js"];
const PLUGIN_ONLY = new Set(["@elgato/streamdeck", "node:fs", "node:os", "node:path"]);
const URLS = new Set(["http://www.w3.org/2000/svg", "https://api.anthropic.com/api/oauth/usage", "https://claude.ai/settings/usage"]);
const FORBIDDEN = ["require(", "createRequire", "getBuiltinModule", "process.binding", "child_process", "WebSocket", "eval(", "new Function", "import(", "refreshToken"];
const PLANTS = [
  "import { writeSync } from \"node:fs\"",
  "import http from \"node:http\"",
  "import * as fs from \"node:fs\"\nfs.writeFileSync(\"x\", \"y\")",
  "process.getBuiltinModule(\"node:https\")",
];

const read = (path) => readFileSync(new URL(path, PLUGIN), "utf8");

function importProblems(name, clause, source) {
  if (clause.includes("*")) return [`${name}: namespace import of ${source}`];
  const isDefault = clause !== "" && !clause.startsWith("{");
  if (isDefault && !(clause === "streamDeck" && source === "@elgato/streamdeck")) return [`${name}: default import ${clause}`];
  if (/^\.\/[\w-]+\.js$/.test(source)) return [];
  if (name !== "plugin.js" || !PLUGIN_ONLY.has(source)) return [`${name}: imports ${source}`];
  if (source === "node:fs" && clause !== "{ readFileSync }") return [`${name}: takes ${clause} from node:fs`];
  return [];
}

function violations(name, text) {
  const imports = [...text.matchAll(/\bimport\s*([^"';]*?)\s*(?:from\s*)?["']([^"']+)["']/g)];
  const problems = imports.flatMap(([, clause, source]) => importProblems(name, clause.trim(), source));
  problems.push(...FORBIDDEN.filter((word) => text.includes(word)));
  problems.push(...(text.match(/\b(?!readFileSync\b)\w+Sync\b/g) ?? []));
  if (name !== "usage-client.js" && /\bfetch\(/.test(text)) problems.push("fetch(");
  problems.push(...(text.match(/https?:\/\/[^\s"'`)]+/g) ?? []).filter((url) => !URLS.has(url)));
  return problems;
}

test("the import and literal detector fires on four planted texts", () => {
  for (const plant of PLANTS) assert.notDeepEqual(violations("plugin.js", plant), [], plant);
});

test("bin holds only allowed imports, calls and hosts", () => {
  assert.deepEqual(readdirSync(new URL("bin/", PLUGIN)).sort(), BIN_FILES);
  for (const name of BIN_FILES) assert.deepEqual(violations(name, read(`bin/${name}`)), [], name);
});

test("plugin.js logs only through quietLog", () => {
  const text = read("bin/plugin.js");
  assert.match(text, /quietLog\(\(line\) => streamDeck\.logger\.info\(line\)\)/);
  assert.equal(text.split("streamDeck.logger").length, 2);
});

function imageExists(path) {
  const has = (suffix) => existsSync(new URL(`${path}${suffix}`, PLUGIN));
  return has(".svg") || (has(".png") && has("@2x.png"));
}

test("the manifest holds every required key and names files that exist", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const top = ["Actions", "Author", "CodePath", "Description", "Icon", "Name", "OS", "SDKVersion", "Software", "UUID", "Version"];
  assert.deepEqual(top.filter((key) => !(key in manifest)), []);
  const [action] = manifest.Actions;
  assert.deepEqual(["Icon", "Name", "States", "UUID"].filter((key) => !(key in action)), []);
  assert.ok(action.States.every((state) => "Image" in state));
  assert.ok(manifest.OS.every((os) => "MinimumVersion" in os && "Platform" in os));
  assert.ok(manifest.Software.MinimumVersion && manifest.Nodejs.Version);
  const images = [manifest.Icon, manifest.CategoryIcon, action.Icon, action.Encoder.Icon, ...action.States.map((state) => state.Image)];
  assert.deepEqual(images.filter((image) => !imageExists(image)), []);
  assert.deepEqual(["", "@2x"].filter((scale) => !existsSync(new URL(`${action.Encoder.Icon}${scale}.png`, PLUGIN))), []);
  const files = [manifest.CodePath, action.Encoder.layout, action.PropertyInspectorPath];
  assert.deepEqual(files.filter((file) => !existsSync(new URL(file, PLUGIN))), []);
});

test("the settings panel offers every setting once and nothing else, with the reset button, and the version is 1.1.0.0", () => {
  const html = read("ui/usage.html");
  const settings = [...html.matchAll(/setting="(\w+)"/g)].map((match) => match[1]);
  const labels = [...html.matchAll(/label="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(settings.sort(), Object.keys(readSettings({})).sort());
  assert.deepEqual(labels, ["View", "Chart", "Background", "Bar", "Text", "Amber at", "Red at", "Auto-rotate", "Seconds"]);
  assert.match(html, />Reset colours to default<\/sdpi-button>[\s\S]*sendToPlugin", \{ event: "resetColours" \}/);
  assert.equal(JSON.parse(read("manifest.json")).Version, "1.1.0.0");
});

test("the slot layout has an id and one keyed pixmap item", () => {
  const layout = JSON.parse(read("layouts/usage-slot.json"));
  assert.ok("id" in layout && "items" in layout);
  assert.ok(layout.items.every((item) => "key" in item && "rect" in item && "type" in item));
});
