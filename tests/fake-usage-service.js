const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const body = process.env.FAKE_USAGE_BODY;

globalThis.fetch = async (url) => {
  if (url !== USAGE_URL || body === undefined) throw new Error("the fake usage service only answers the usage address");
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
};
