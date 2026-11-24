import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "../com.psynalytics.claude-usage.sdPlugin/node_modules/ws/wrapper.mjs";

const PLUGIN_DIR = fileURLToPath(new URL("../com.psynalytics.claude-usage.sdPlugin/", import.meta.url));
const TMP = fileURLToPath(new URL("./.tmp/", import.meta.url));
const FAKE_SERVICE = new URL("./fake-usage-service.js", import.meta.url).href;
const HOUR = 3600000;
const UUID = "com.psynalytics.claude-usage";
const DEVICE = { id: "dev-1", name: "Deck", type: 7, size: { columns: 4, rows: 2 } };
const INFO = {
  application: { font: "Segoe UI", language: "en", platform: "windows", platformVersion: "10", version: "6.9" },
  plugin: { uuid: UUID, version: "1.0.0.0" },
  devicePixelRatio: 1,
  colors: {},
  devices: [DEVICE],
};
const children = [];
const servers = [];

after(async () => {
  for (const child of children) await stopChild(child);
  for (const server of servers) await closeServer(server);
  rmSync(TMP, { recursive: true, force: true });
});

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  process.kill(child.pid);
  await exited;
}

function closeServer(server) {
  for (const client of server.clients) client.terminate();
  return new Promise((resolve) => server.close(resolve));
}

const svgOf = (uri = "") => Buffer.from(uri.split(",")[1] ?? "", "base64").toString("utf8");
const COORDINATES = { column: 0, row: 0 };
const appearPayload = (controller) => ({ controller, settings: {}, coordinates: COORDINATES, isInMultiAction: false });

function send(link, event, context, payload) {
  link.socket.send(JSON.stringify({ event, action: `${UUID}.view`, context, device: DEVICE.id, payload }));
}

function waitFor(link, match) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching message within 10 s")), 10000);
    const check = () => {
      const found = link.messages.find(match);
      if (found === undefined) return;
      clearTimeout(timer);
      link.socket.off("message", check);
      resolve(found);
    };
    link.socket.on("message", check);
    check();
  });
}

async function startPlugin(env, globals = null) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const link = { socket: null, messages: [] };
  const connected = new Promise((resolve) => server.once("connection", (socket) => {
    socket.on("message", (data) => link.messages.push(JSON.parse(String(data))));
    resolve(socket);
  }));
  const port = String(server.address().port);
  const preload = env.FAKE_USAGE_BODY === undefined ? [] : ["--import", FAKE_SERVICE];
  const args = [...preload, "bin/plugin.js", "-port", port, "-pluginUUID", UUID, "-registerEvent", "registerPlugin", "-info", JSON.stringify(INFO)];
  const child = spawn(process.execPath, args, { cwd: PLUGIN_DIR, env, stdio: "ignore" });
  children.push(child);
  link.child = child;
  const exited = new Promise((resolve, reject) => child.once("exit", (code) => reject(new Error(`plugin exited with code ${code}`))));
  link.socket = await Promise.race([connected, exited]);
  await waitFor(link, (message) => message.event === "registerPlugin");
  if (globals === null) return link;
  await waitFor(link, (message) => message.event === "getGlobalSettings");
  link.socket.send(JSON.stringify({ event: "didReceiveGlobalSettings", payload: { settings: globals } }));
  return link;
}

function showBoth(link) {
  send(link, "willAppear", "dial-1", appearPayload("Encoder"));
  send(link, "willAppear", "key-1", appearPayload("Keypad"));
}

const drawn = (event, field, accept) => (message) => message.event === event && accept(svgOf(field(message.payload)));
const signIn = (svg) => svg.includes(">Sign in</text>");

function signInEnv(name, expiresAt) {
  const config = `${TMP}${name}`;
  mkdirSync(config, { recursive: true });
  writeFileSync(`${config}/.credentials.json`, JSON.stringify({ claudeAiOauth: { accessToken: `${name}-test-token`, expiresAt } }));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config, HOME: TMP, USERPROFILE: TMP };
  delete env.FAKE_USAGE_BODY;
  return env;
}

const expiredSignInEnv = () => signInEnv("expired", 1000);

function fakeServiceEnv(percent) {
  const resetsAt = new Date(Date.now() + 72 * HOUR).toISOString();
  const body = JSON.stringify({ limits: [{ kind: "weekly_all", percent, resets_at: resetsAt }] });
  return { ...signInEnv("fake", Date.now() + 24 * HOUR), FAKE_USAGE_BODY: body };
}

function exitWithin(child, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`plugin still running ${ms / 1000} s after the connection closed`)), ms);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test("the plugin draws Sign in on a dial and a key and saves a rotated view", { timeout: 30000 }, async () => {
  const link = await startPlugin(expiredSignInEnv());
  showBoth(link);
  await waitFor(link, drawn("setFeedback", (payload) => payload.face, signIn));
  await waitFor(link, drawn("setImage", (payload) => payload.image, signIn));
  send(link, "dialRotate", "dial-1", { controller: "Encoder", settings: {}, coordinates: COORDINATES, ticks: 1, pressed: false });
  const saved = await waitFor(link, (message) => message.event === "setSettings");
  assert.deepEqual([saved.context, saved.payload], ["dial-1", { view: "model" }]);
});

test("a long touch opens the usage page and a short tap does not", { timeout: 30000 }, async () => {
  const link = await startPlugin(expiredSignInEnv());
  send(link, "willAppear", "dial-1", appearPayload("Encoder"));
  await waitFor(link, drawn("setFeedback", (payload) => payload.face, signIn));
  const tap = (hold) => send(link, "touchTap", "dial-1", { controller: "Encoder", settings: {}, coordinates: COORDINATES, hold, tapPos: [20, 20] });
  const opens = (message) => message.event === "openUrl";
  tap(false);
  send(link, "dialRotate", "dial-1", { controller: "Encoder", settings: {}, coordinates: COORDINATES, ticks: 1, pressed: false });
  await waitFor(link, (message) => message.event === "setSettings");
  const early = link.messages.filter(opens).length;
  tap(true);
  const opened = await waitFor(link, opens);
  assert.deepEqual([early, opened.payload], [0, { url: "https://claude.ai/settings/usage" }]);
});

test("reset colours from the panel saves settings without the three colours", { timeout: 30000 }, async () => {
  const link = await startPlugin(expiredSignInEnv());
  const settings = { view: "week", chart: "ring", ground: "#000000", bar: "#00ff00", text: "#ff0000" };
  send(link, "willAppear", "dial-1", { ...appearPayload("Encoder"), settings });
  await waitFor(link, drawn("setFeedback", (payload) => payload.face, signIn));
  send(link, "sendToPlugin", "dial-1", { event: "resetColours" });
  const saved = await waitFor(link, (message) => message.event === "setSettings");
  assert.deepEqual(saved.payload, { view: "week", chart: "ring" });
});

test("the plugin ends by itself once the Stream Deck connection is gone, with auto-rotate on", { timeout: 30000 }, async () => {
  const link = await startPlugin(expiredSignInEnv());
  send(link, "willAppear", "dial-1", { ...appearPayload("Encoder"), settings: { rotate: true, rotateSeconds: 3 } });
  await waitFor(link, drawn("setFeedback", (payload) => payload.face, signIn));
  const exit = exitWithin(link.child, 10000);
  link.socket.terminate();
  assert.deepEqual(await exit, { code: 0, signal: null });
});

test("the plugin writes an hourly point to global settings and reads it back after a restart", { timeout: 30000 }, async () => {
  const env = fakeServiceEnv(42);
  const first = await startPlugin(env, {});
  send(first, "willAppear", "dial-1", appearPayload("Encoder"));
  await waitFor(first, drawn("setFeedback", (payload) => payload.face, (svg) => svg.includes(">42<")));
  const written = await waitFor(first, (message) => message.event === "setGlobalSettings");
  const [window] = written.payload.history;
  const older = { ...window.points[0], atMs: window.points[0].atMs - 2 * HOUR };
  const second = await startPlugin(env, { history: [{ key: window.key, points: [older] }] });
  send(second, "willAppear", "dial-1", appearPayload("Encoder"));
  const rewritten = await waitFor(second, (message) => message.event === "setGlobalSettings");
  const points = rewritten.payload.history[0].points;
  assert.deepEqual([written.payload.history.length, window.points.length, points.length, points[0], points[1].week], [1, 1, 2, older, 42]);
});

test("live sign-in prints the value on both faces", { skip: process.env.LIVE_SIGNIN !== "1", timeout: 30000 }, async () => {
  const env = { ...process.env };
  delete env.CLAUDE_CONFIG_DIR;
  const link = await startPlugin(env);
  showBoth(link);
  const loaded = (svg) => svg !== "" && !svg.includes(">Loading</text>");
  const dial = await waitFor(link, drawn("setFeedback", (payload) => payload.face, loaded));
  const key = await waitFor(link, drawn("setImage", (payload) => payload.image, loaded));
  for (const svg of [svgOf(dial.payload.face), svgOf(key.payload.image)]) {
    console.log(svg.match(/font-weight="700"[^>]*>(.*?)<\/text>/)[1].replace(/<[^>]+>/g, ""));
  }
});
