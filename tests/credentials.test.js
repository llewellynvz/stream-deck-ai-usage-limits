import { test } from "node:test";
import assert from "node:assert/strict";
import { readCredential } from "../com.psynalytics.claude-usage.sdPlugin/bin/credentials.js";

const NOW = 1800000000000;
const HOME_FILE = "C:/home/user/.claude/.credentials.json";
const CONFIG_FILE = "D:/config/.credentials.json";

function fail(code) {
  return () => {
    throw Object.assign(new Error("read failed"), { code });
  };
}

function fileReader(files) {
  return (path) => (path in files ? files[path] : fail("ENOENT")());
}

function read(readFile, env = {}) {
  return readCredential({ env, homedir: () => "C:/home/user", readFile, now: () => NOW });
}

function oauthFile(oauth) {
  return JSON.stringify({ claudeAiOauth: oauth });
}

test("a valid sign-in file gives ok with the token and expiry", () => {
  const files = { [HOME_FILE]: oauthFile({ accessToken: "tok-a", expiresAt: NOW + 1000 }) };
  assert.deepEqual(read(fileReader(files)), { status: "ok", token: "tok-a", expiresAtMs: NOW + 1000 });
  const noExpiry = { [HOME_FILE]: oauthFile({ accessToken: "tok-a" }) };
  assert.deepEqual(read(fileReader(noExpiry)), { status: "ok", token: "tok-a", expiresAtMs: null });
});

test("a missing file or a missing token gives missing", () => {
  assert.deepEqual(read(fileReader({})), { status: "missing" });
  const noToken = { [HOME_FILE]: oauthFile({ accessToken: 42 }) };
  assert.deepEqual(read(fileReader(noToken)), { status: "missing" });
});

test("bad JSON gives unreadable", () => {
  assert.deepEqual(read(fileReader({ [HOME_FILE]: "{\"claudeAiOauth\": {" })), { status: "unreadable" });
});

test("a locked file gives unreadable", () => {
  assert.deepEqual(read(fail("EBUSY")), { status: "unreadable" });
});

test("an expiry at or before now gives expired", () => {
  const files = { [HOME_FILE]: oauthFile({ accessToken: "tok-a", expiresAt: NOW }) };
  assert.deepEqual(read(fileReader(files)), { status: "expired" });
});

test("a string expiry is read as a number only when it is all digits, else the token is used", () => {
  const at = (expiresAt) => read(fileReader({ [HOME_FILE]: oauthFile({ accessToken: "tok-a", expiresAt }) }));
  const usable = (expiresAtMs) => ({ status: "ok", token: "tok-a", expiresAtMs });
  assert.deepEqual([at("1000"), at("9999999999999")], [{ status: "expired" }, usable(9999999999999)]);
  for (const text of ["2020-01-01T00:00:00Z", "abc 12", "12/31", "1e3", " 1000 "]) assert.deepEqual(at(text), usable(null), text);
});

test("CLAUDE_CONFIG_DIR wins over the home folder", () => {
  const files = {
    [HOME_FILE]: oauthFile({ accessToken: "tok-home" }),
    [CONFIG_FILE]: oauthFile({ accessToken: "tok-config" }),
  };
  assert.equal(read(fileReader(files), { CLAUDE_CONFIG_DIR: "D:/config" }).token, "tok-config");
});

test("the result carries only status, token and expiry when the file holds a refresh token", () => {
  const files = { [HOME_FILE]: oauthFile({ accessToken: "tok-a", refreshToken: "ref-a", expiresAt: NOW + 1 }) };
  assert.deepEqual(Object.keys(read(fileReader(files))).sort(), ["expiresAtMs", "status", "token"]);
});
