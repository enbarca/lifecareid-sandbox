// The local runtime for the source: Node's http module in front of the same
// handlers the Pages function mounts. What is under test is the adapter (URL,
// headers, body, status and headers back), with the sandbox mocked exactly as
// in source/source.test.mjs. Run: node --test (from the kit root)
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { createServer, envFrom } from "./server.mjs";

const SANDBOX = "http://localhost:8810";
const OWNER = "did:web:sandbox.local:u:817612d13f3219b6";
const TOKEN = "lc_test-token";
const ACTIVE = {
  active: true, token_type: "access", resource_owner: OWNER, scope: "recovery",
  purpose: "agent governance pilot", requester: "sbx_client",
  consent_id: "urn:lifecare:consent:abc", expires_at: "2999-01-01T00:00:00+00:00",
};

const realFetch = globalThis.fetch;
let server;
let base;

before(async () => {
  server = createServer({
    LIFECAREID_SANDBOX_ORIGIN: SANDBOX,
    LIFECAREID_SANDBOX_SOURCE_CLIENT_ID: "sandbox-source",
    LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET: "s3",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/sandbox-source`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => { globalThis.fetch = realFetch; });

// The mocked sandbox answers the two upstream calls; everything else (the test's
// own calls to the local server) goes to the real fetch.
function sandbox({ introspection = () => ACTIVE } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (!target.startsWith(SANDBOX)) return realFetch(url, init);
    const body = JSON.parse(init.body);
    calls.push({ url: target, body, headers: init.headers });
    const answer = target.endsWith("/v1/token/introspect") ? introspection(body) : { recorded: true, entry_hash: "h1" };
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  return calls;
}

test("envFrom passes the three source variables and nothing else", () => {
  assert.deepEqual(envFrom({ LIFECAREID_SANDBOX_ORIGIN: "x", PATH: "/bin", HOME: "/h" }),
    { LIFECAREID_SANDBOX_ORIGIN: "x" });
  assert.deepEqual(envFrom({}), {});
});

test("the descriptor answers without a token and names the address the caller used", async () => {
  sandbox();
  const res = await realFetch(base + "/");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.equal(body.client_credentials, true);
  assert.equal(body.mcp.endpoint, base + "/mcp");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("a REST read goes through introspection and the ledger record, as the source itself", async () => {
  const calls = sandbox();
  const res = await realFetch(`${base}/v1/source/recovery?owner=${encodeURIComponent(OWNER)}`,
    { headers: { authorization: "Bearer " + TOKEN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.scope, "recovery");
  assert.equal(body.access_recorded, true);
  assert.equal(body.ledger_entry_hash, "h1");
  assert.deepEqual(calls.map((c) => c.url), [SANDBOX + "/v1/token/introspect", SANDBOX + "/v1/access/record"]);
  assert.equal(calls[0].headers.authorization, "Basic " + btoa("sandbox-source:s3"));
});

test("a POST body reaches the MCP face intact", async () => {
  sandbox();
  const res = await realFetch(base + "/mcp", {
    method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "read_scope", arguments: { scope: "recovery", owner: OWNER } } }),
  });
  assert.equal(res.status, 200);
  const { result } = await res.json();
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.resource_owner, OWNER);
});

test("refusals keep their status and headers", async () => {
  sandbox();
  const none = await realFetch(`${base}/v1/source/recovery?owner=${encodeURIComponent(OWNER)}`);
  assert.equal(none.status, 401);
  assert.match(none.headers.get("www-authenticate"), /^Bearer/);
  assert.equal((await none.json()).error, "missing_token");
  sandbox({ introspection: () => ({ active: false }) });
  const revoked = await realFetch(`${base}/v1/source/recovery?owner=${encodeURIComponent(OWNER)}`,
    { headers: { authorization: "Bearer " + TOKEN } });
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json()).error, "invalid_token");
  assert.equal((await realFetch(`http://127.0.0.1:${server.address().port}/elsewhere`)).status, 404);
});
