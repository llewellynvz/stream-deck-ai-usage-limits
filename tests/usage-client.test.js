import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUsage } from "../com.psynalytics.claude-usage.sdPlugin/bin/usage-client.js";

function serve(status, body = "{}", headers = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status, headers });
  };
  return { impl, calls };
}

function fetchWith(status, body, headers) {
  return fetchUsage("tok-a", serve(status, body, headers).impl);
}

test("one GET goes to the usage URL with exactly the four headers", async () => {
  const { impl, calls } = serve(200);
  await fetchUsage("tok-a", impl);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, "https://api.anthropic.com/api/oauth/usage");
  assert.equal(init.method, "GET");
  assert.deepEqual(init.headers, {
    Authorization: "Bearer tok-a",
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": "stream-deck-usage/1.0",
    Accept: "application/json",
  });
  assert.equal(init.redirect, "error");
  assert.ok(init.signal instanceof AbortSignal);
});

test("200 parses the body", async () => {
  assert.deepEqual(await fetchWith(200, "{\"a\":1}"), { status: "ok", body: { a: 1 } });
  assert.deepEqual(await fetchWith(200, "not json"), { status: "error", detail: "SyntaxError" });
});

test("401 and 403 give unauthorized with the status only", async () => {
  assert.deepEqual(await fetchWith(401), { status: "unauthorized", detail: "status 401" });
  assert.deepEqual(await fetchWith(403), { status: "unauthorized", detail: "status 403" });
});

test("429 turns Retry-After seconds into ms and falls back to 300000", async () => {
  assert.deepEqual(await fetchWith(429, "", { "Retry-After": "120" }), { status: "rate_limited", retryAfterMs: 120000 });
  const dated = await fetchWith(429, "", { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" });
  assert.deepEqual(dated, { status: "rate_limited", retryAfterMs: 300000 });
  assert.deepEqual(await fetchWith(429, ""), { status: "rate_limited", retryAfterMs: 300000 });
});

test("other statuses, thrown errors and oversized bodies give error", async () => {
  assert.deepEqual(await fetchWith(503, "secret body"), { status: "error", detail: "status 503" });
  const timeout = async () => {
    throw new DOMException("timed out", "TimeoutError");
  };
  assert.deepEqual(await fetchUsage("tok-a", timeout), { status: "error", detail: "TimeoutError" });
  const oversized = JSON.stringify({ pad: "x".repeat(299990) });
  assert.equal(oversized.length, 300000);
  assert.deepEqual(await fetchWith(200, oversized), { status: "error", detail: "RangeError" });
});
