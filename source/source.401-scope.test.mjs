// Every 401 from the sandbox source names the one scope it suggests, so a stock
// MCP client that reconnects after expiry or revocation asks for that scope and
// the issuer can answer it (RFC 6750 section 3). The scope is the one the request
// was for when it names a scope-bound read, otherwise `daily`. `error` and
// `error_description` are unchanged. The sandbox is mocked.
//
// Run: node --test (from the kit root)
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { onRequest } from "../pages/functions/sandbox-source/[[path]].js";

const ORIGIN = "https://lifecare.id";
const RESOURCE = ORIGIN + "/sandbox-source/mcp";
const META = `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/sandbox-source/mcp"`;
const ENV = { LIFECAREID_SANDBOX_ORIGIN: "https://sandbox.lifecare.id" };
const OWNER = "did:web:sandbox.example:u:817612d13f3219b6";
const ACTIVE = {
  active: true, token_type: "access", resource_owner: OWNER, scope: "recovery",
  expires_at: "2999-01-01T00:00:00+00:00", aud: RESOURCE,
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const sandbox = (answer) => {
  globalThis.fetch = async () => new Response(JSON.stringify(answer), { status: 200 });
};

const mcp = (message, token) => {
  const body = JSON.stringify(message);
  return onRequest({
    request: new Request(RESOURCE, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(body).length),
        ...(token ? { authorization: "Bearer " + token } : {}) },
      body,
    }),
    env: ENV,
  });
};
const LIST = { jsonrpc: "2.0", id: 1, method: "tools/list" };
const callOf = (scope) => ({
  jsonrpc: "2.0", id: 1, method: "tools/call",
  params: { name: "read_scope", arguments: { scope, owner: OWNER } },
});
const rest = (scope, token) => onRequest({
  request: new Request(`${ORIGIN}/sandbox-source/v1/source/${scope}?owner=${encodeURIComponent(OWNER)}`,
    { headers: token ? { authorization: "Bearer " + token } : {} }),
  env: ENV,
});

// One row per 401 case: the sandbox's answer, the token, the refusal code and
// description (unchanged), and the challenge that must come back.
const CASES = [
  { name: "no credential", token: null, answer: null, error: "missing_token",
    detail: "present a sandbox access token as Authorization: Bearer lc_...",
    mcp: `Bearer ${META}, scope="daily"`, rest: 'Bearer scope="recovery"' },
  { name: "malformed token", token: "x".repeat(600), answer: null, error: "invalid_token",
    detail: "token inactive or unknown",
    mcp: `Bearer ${META}, error="invalid_token", scope="daily"`, rest: 'Bearer error="invalid_token", scope="recovery"' },
  { name: "expired token", token: "lc_expired", answer: { ...ACTIVE, expires_at: "2020-01-01T00:00:00+00:00" },
    error: "invalid_token", detail: "token inactive or unknown",
    mcp: `Bearer ${META}, error="invalid_token", scope="daily"`, rest: 'Bearer error="invalid_token", scope="recovery"' },
  { name: "revoked token", token: "lc_revoked", answer: { active: false }, error: "invalid_token",
    detail: "token inactive or unknown",
    mcp: `Bearer ${META}, error="invalid_token", scope="daily"`, rest: 'Bearer error="invalid_token", scope="recovery"' },
  { name: "wrong audience", token: "lc_aud", answer: { ...ACTIVE, aud: "https://other.example/sandbox-source/mcp" },
    error: "invalid_token", detail: "the token was issued for another resource",
    mcp: `Bearer ${META}, error="invalid_token", scope="daily"`, rest: 'Bearer error="invalid_token", scope="recovery"' },
  { name: "no audience", token: "lc_noaud", answer: (({ aud, ...rest }) => rest)(ACTIVE), error: "invalid_token",
    detail: "this source requires a token with an audience; take your token through the code flow",
    mcp: `Bearer ${META}, error="invalid_token", scope="daily"`, rest: 'Bearer error="invalid_token", scope="recovery"' },
];

for (const c of CASES) {
  test(`401, ${c.name}, MCP: the challenge names scope daily, error unchanged`, async () => {
    if (c.answer) sandbox(c.answer);
    const res = await mcp(LIST, c.token);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("www-authenticate"), c.mcp);
    assert.deepEqual(await res.json(), { detail: c.detail, error: c.error });
  });

  test(`401, ${c.name}, REST read of recovery: the challenge names scope recovery, error unchanged`, async () => {
    if (c.answer) sandbox(c.answer);
    const res = await rest("recovery", c.token);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("www-authenticate"), c.rest);
    assert.deepEqual(await res.json(), { detail: c.detail, error: c.error });
  });
}

test("a tools/call on the cgm tool with an expired token suggests cgm, not daily", async () => {
  sandbox({ ...ACTIVE, expires_at: "2020-01-01T00:00:00+00:00" });
  const res = await mcp(callOf("cgm"), "lc_expired");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), `Bearer ${META}, error="invalid_token", scope="cgm"`);
});

test("a tools/call with no credential suggests the scope it was for", async () => {
  const res = await mcp(callOf("recovery"), null);
  assert.equal(res.headers.get("www-authenticate"), `Bearer ${META}, scope="recovery"`);
});

test("an unknown scope, a batch or an unparseable body fall back to daily", async () => {
  sandbox({ active: false });
  const want = `Bearer ${META}, error="invalid_token", scope="daily"`;
  assert.equal((await mcp(callOf("nonsense"), "lc_x")).headers.get("www-authenticate"), want);
  assert.equal((await mcp([callOf("cgm")], "lc_x")).headers.get("www-authenticate"), want);
  const garbled = await onRequest({
    request: new Request(RESOURCE, { method: "POST", headers: { authorization: "Bearer lc_x" }, body: "{not json" }),
    env: ENV,
  });
  assert.equal(garbled.headers.get("www-authenticate"), want);
});

test("REST weekly-summary suggests daily, an unknown REST scope falls back to daily", async () => {
  const w = await onRequest({ request: new Request(`${ORIGIN}/sandbox-source/v1/weekly-summary?owner=${OWNER}`), env: ENV });
  assert.equal(w.headers.get("www-authenticate"), 'Bearer scope="daily"');
  const u = await rest("nonsense", null);
  assert.equal(u.status, 401);
  assert.equal(u.headers.get("www-authenticate"), 'Bearer scope="daily"');
});

test("an MCP get_weekly_summary call suggests daily", async () => {
  sandbox({ active: false });
  const res = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "get_weekly_summary", arguments: { owner: OWNER } } }, "lc_x");
  assert.equal(res.headers.get("www-authenticate"), `Bearer ${META}, error="invalid_token", scope="daily"`);
});

test("a body with no content-length is not read for the hint: daily", async () => {
  sandbox({ active: false });
  const res = await onRequest({
    request: new Request(RESOURCE, { method: "POST", headers: { authorization: "Bearer lc_x" }, body: JSON.stringify(callOf("cgm")) }),
    env: ENV,
  });
  assert.equal(res.headers.get("www-authenticate"), `Bearer ${META}, error="invalid_token", scope="daily"`);
});

test("an oversized body is not read for the hint: 401 with daily, no 500", async () => {
  sandbox({ active: false });
  const big = { ...callOf("cgm"), pad: "x".repeat(70 * 1024) };
  const res = await mcp(big, "lc_x");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), `Bearer ${META}, error="invalid_token", scope="daily"`);
  const small = await mcp(callOf("cgm"), "lc_x");
  assert.equal(small.headers.get("www-authenticate"), `Bearer ${META}, error="invalid_token", scope="cgm"`);
});

test("the 403 insufficient_scope on a single tools/call keeps its challenge, and CORS still exposes www-authenticate", async () => {
  sandbox(ACTIVE);
  const res = await mcp(callOf("cgm"), "lc_good");
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("www-authenticate"), `Bearer error="insufficient_scope", scope="cgm", ${META}`);
  const refused = await mcp(LIST, null);
  assert.match(refused.headers.get("access-control-expose-headers"), /www-authenticate/);
});
