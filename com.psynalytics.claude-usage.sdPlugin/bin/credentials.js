const CREDENTIAL_FILE = ".credentials.json";

function credentialPath(env, homedir) {
  const configDir = env.CLAUDE_CONFIG_DIR || `${homedir()}/.claude`;
  return `${configDir}/${CREDENTIAL_FILE}`;
}

function parseCredentialFile(readFile, path) {
  try {
    return { json: JSON.parse(readFile(path)) };
  } catch (error) {
    return { failure: error?.code === "ENOENT" ? "missing" : "unreadable" };
  }
}

function expiryMs(expiresAt) {
  const ms = typeof expiresAt === "string" && /^\d+$/.test(expiresAt) ? Number(expiresAt) : expiresAt;
  return Number.isFinite(ms) ? ms : null;
}

export function readCredential({ env, homedir, readFile, now }) {
  const parsed = parseCredentialFile(readFile, credentialPath(env, homedir));
  if (parsed.failure) return { status: parsed.failure };
  const oauth = parsed.json?.claudeAiOauth;
  if (typeof oauth?.accessToken !== "string") return { status: "missing" };
  const expiresAtMs = expiryMs(oauth.expiresAt);
  if (expiresAtMs !== null && expiresAtMs <= now()) return { status: "expired" };
  return { status: "ok", token: oauth.accessToken, expiresAtMs };
}
