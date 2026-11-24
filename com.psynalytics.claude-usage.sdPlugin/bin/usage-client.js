const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const MAX_BODY_BYTES = 262144;
const DEFAULT_RETRY_MS = 300000;
const TIMEOUT_MS = 15000;

function requestInit(token) {
  return {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "stream-deck-usage/1.0",
      Accept: "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
}

function retryAfterMs(header) {
  return /^\d+$/.test(header ?? "") ? Number(header) * 1000 : DEFAULT_RETRY_MS;
}

async function readCappedText(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("response body over the size cap");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function interpret(response) {
  if (response.ok) return { status: "ok", body: JSON.parse(await readCappedText(response)) };
  await response.body?.cancel();
  const { status } = response;
  if (status === 401 || status === 403) return { status: "unauthorized", detail: `status ${status}` };
  if (status === 429) return { status: "rate_limited", retryAfterMs: retryAfterMs(response.headers.get("retry-after")) };
  return { status: "error", detail: `status ${status}` };
}

export async function fetchUsage(token, fetchImpl) {
  try {
    return await interpret(await fetchImpl(USAGE_URL, requestInit(token)));
  } catch (error) {
    return { status: "error", detail: String(error?.name ?? "Error") };
  }
}
