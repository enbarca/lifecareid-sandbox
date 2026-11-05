// OAuth 2.0 Protected Resource Metadata (RFC 9728) for the sandbox source's MCP
// endpoint, and the resource_metadata challenge on its 401 (RFC 9728 section
// 5.1; MCP authorization, "Protected Resource Metadata Discovery
// Requirements"). The sandbox authorization server is mocked.
//
// Run: node --test (from the kit root)
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { onRequest as sourceRequest } from "../pages/functions/sandbox-source/[[path]].js";
import { onRequest as metadataRequest } from "../pages/functions/.well-known/oauth-protected-resource/[[path]].js";
import { Refusal, SCOPES, VERSION } from "./source.js";

const SANDBOX = "https://sandbox.lifecare.id";
const ENV = { LIFECAREID_SANDBOX_ORIGIN: SANDBOX };
const ORIGIN = "https://lifecare.id";
const METADATA_URL = ORIGIN + "/.well-known/oauth-protected-resource/sandbox-source/mcp";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const wellKnown = (path, { env = ENV, origin = ORIGIN, method = "GET" } = {}) =>
  metadataRequest({ request: new Request(origin + path, { method }), env });

function mcpCall(token, path = "/sandbox-source/mcp") {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  return sourceRequest({
    request: new Request(ORIGIN + path, {
      method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    env: ENV,
  });
}

function inactiveSandbox() {
  globalThis.fetch = async () => new Response(JSON.stringify({ active: false }), { status: 200 });
}

// ------------------------------------------------------------ the document

test("the path form answers 200 JSON with the RFC 9728 fields", async () => {
  const res = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^application\/json/);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await res.json(), {
    resource: "https://lifecare.id/sandbox-source/mcp",
    authorization_servers: [SANDBOX],
    bearer_methods_supported: ["header"],
    scopes_supported: Object.keys(SCOPES),
    resource_documentation: "https://developers.lifecare.id/sandbox-data-source",
  });
});

test("scopes_supported is exactly the vocabulary the source accepts", async () => {
  const body = await (await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp")).json();
  assert.deepEqual(
    [...body.scopes_supported].sort(),
    ["activity", "body_composition", "cgm", "daily", "insights", "labs", "recovery"],
  );
});

test("resource is derived from the request origin, so a preview deployment names itself", async () => {
  const res = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp",
    { origin: "https://abc123.lifecareid.pages.dev" });
  assert.equal((await res.json()).resource, "https://abc123.lifecareid.pages.dev/sandbox-source/mcp");
});

test("a trailing slash and HEAD answer the same; OPTIONS is a CORS preflight", async () => {
  assert.equal((await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp/")).status, 200);
  const head = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp", { method: "HEAD" });
  assert.equal(head.status, 200);
  const options = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp", { method: "OPTIONS" });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), "*");
});

test("the root form is a 404: the resource is the MCP endpoint, not the origin (RFC 9728 section 3.3)", async () => {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/"]) {
    assert.equal((await wellKnown(path)).status, 404, path);
  }
});

test("a path that is not the MCP resource is a 404, REST included", async () => {
  for (const path of [
    "/.well-known/oauth-protected-resource/sandbox-source",
    "/.well-known/oauth-protected-resource/sandbox-source/v1/scopes",
    "/.well-known/oauth-protected-resource/sandbox-source/mcp/extra",
    "/.well-known/oauth-protected-resource/other",
  ]) {
    assert.equal((await wellKnown(path)).status, 404, path);
  }
});

test("POST is refused with 405", async () => {
  const res = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp", { method: "POST" });
  assert.equal(res.status, 405);
});

test("with no sandbox configured the document is 503, as for the data routes, not a guess", async () => {
  for (const env of [{}, { LIFECAREID_SANDBOX_ORIGIN: "http://not-loopback.example" }]) {
    const res = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp", { env });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "source_not_configured");
  }
});

// ------------------------------------------------------------ the challenge

test("MCP, no token: 401 with a bare Bearer challenge carrying resource_metadata and the scope to ask for", async () => {
  const res = await mcpCall(null);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), `Bearer resource_metadata="${METADATA_URL}", scope="daily"`);
  assert.equal((await res.json()).error, "missing_token");
});

test("MCP, a refused token: the challenge adds error=invalid_token", async () => {
  inactiveSandbox();
  const res = await mcpCall("lc_revoked");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"),
    `Bearer resource_metadata="${METADATA_URL}", error="invalid_token", scope="daily"`);
  assert.equal((await res.json()).error, "invalid_token");
});

test("MCP, an oversized token is refused before the sandbox is asked, with the same challenge", async () => {
  globalThis.fetch = async () => { throw new Error("the sandbox must not be asked"); };
  const res = await mcpCall("x".repeat(600));
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /resource_metadata=".*", error="invalid_token", scope="daily"$/);
});

test("the challenge's URL is the one the document answers at (round trip)", async () => {
  const challenge = (await mcpCall(null)).headers.get("www-authenticate");
  const url = new URL(/resource_metadata="([^"]+)"/.exec(challenge)[1]);
  const res = await metadataRequest({ request: new Request(url), env: ENV });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).resource, ORIGIN + "/sandbox-source/mcp");
});

test("the challenge names the request's own origin on a preview deployment", async () => {
  const res = await sourceRequest({
    request: new Request("https://abc123.lifecareid.pages.dev/sandbox-source/mcp", { method: "POST", body: "{}" }),
    env: ENV,
  });
  assert.equal(res.headers.get("www-authenticate"),
    'Bearer resource_metadata="https://abc123.lifecareid.pages.dev/.well-known/oauth-protected-resource/sandbox-source/mcp", scope="daily"');
});

test("a trailing slash on the MCP path is a 308 to the canonical path, so the challenge always matches the URL", async () => {
  const res = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/mcp/?x=1", { method: "POST", body: "{}" }),
    env: ENV,
  });
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), ORIGIN + "/sandbox-source/mcp?x=1");
});

test("REST 401s carry no resource_metadata (the document describes the MCP resource only) but name the scope", async () => {
  const res = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/v1/scopes"), env: ENV,
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), 'Bearer scope="daily"');
});

test("a 403 and a 503 on the MCP path carry no challenge", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ active: true, token_type: "user", subject_did: "did:web:x:u:1" }), { status: 200 });
  const wrongType = await mcpCall("lc_user_token");
  assert.equal(wrongType.status, 403);
  assert.equal(wrongType.headers.get("www-authenticate"), null);

  globalThis.fetch = async () => { throw new Error("sandbox unreachable"); };
  const unavailable = await mcpCall("lc_any");
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, "introspection_unavailable");
  assert.equal(unavailable.headers.get("www-authenticate"), null);
});

test("the descriptor names the metadata URL beside the MCP endpoint", async () => {
  const res = await sourceRequest({ request: new Request(ORIGIN + "/sandbox-source/"), env: ENV });
  const body = await res.json();
  assert.equal(body.mcp.resource_metadata, METADATA_URL);
  assert.equal(body.docs, "https://developers.lifecare.id/sandbox-data-source");
});

// ------------------------------------------------------------ the scope to ask for

test("MCP, a refused token: the challenge carries error and the one scope", async () => {
  inactiveSandbox();
  const header = (await mcpCall("lc_revoked")).headers.get("www-authenticate");
  assert.match(header, /error="invalid_token"/);
  assert.match(header, /scope="daily"/);
});

test("the challenge's scope is one the metadata lists, so a client's request is one the issuer can answer", async () => {
  const challenge = (await mcpCall(null)).headers.get("www-authenticate");
  const scope = /scope="([^"]+)"/.exec(challenge)[1];
  const body = await (await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp")).json();
  assert.equal(scope, "daily");
  assert.ok(body.scopes_supported.includes(scope));
  assert.ok(!scope.includes(" "), "one scope, not a list");
});

test("REST, no token: the challenge names the scope and has no metadata", async () => {
  const res = await sourceRequest({ request: new Request(ORIGIN + "/sandbox-source/v1/scopes"), env: ENV });
  assert.equal(res.headers.get("www-authenticate"), 'Bearer scope="daily"');
});

// ------------------------------------------------------------ step-up (403)

const OWNER = "did:web:sandbox.example:u:817612d13f3219b6";
const ACTIVE = {
  active: true, token_type: "access", resource_owner: OWNER, scope: "recovery",
  purpose: "agent governance pilot", requester: "sbx_client",
  consent_id: "urn:lifecare:consent:abc", expires_at: "2999-01-01T00:00:00+00:00",
  aud: "https://lifecare.id/sandbox-source/mcp",
};

// Stands in for the sandbox and counts what is written to the ledger.
function sandbox(introspection) {
  const calls = { introspect: 0, record: 0 };
  globalThis.fetch = async (url) => {
    if (url.endsWith("/v1/token/introspect")) {
      calls.introspect += 1;
      return new Response(JSON.stringify(introspection), { status: 200 });
    }
    calls.record += 1;
    return new Response(JSON.stringify({ recorded: true, entry_hash: "h1" }), { status: 200 });
  };
  return calls;
}

function restRead(scope, token = "lc_good") {
  return sourceRequest({
    request: new Request(`${ORIGIN}/sandbox-source/v1/source/${scope}?owner=${encodeURIComponent(OWNER)}`,
      { headers: { authorization: "Bearer " + token } }),
    env: ENV,
  });
}

test("REST, a token for another scope: 403 insufficient_scope naming the scope the read asked for", async () => {
  const calls = sandbox(ACTIVE);
  const res = await restRead("cgm");
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("www-authenticate"), 'Bearer error="insufficient_scope", scope="cgm"');
  assert.deepEqual(await res.json(), {
    detail: 'the token covers scope "recovery", not "cgm"', error: "insufficient_scope",
  });
  assert.equal(calls.record, 0);
});

test("a 403 insufficient_scope on the MCP path carries error, scope and resource_metadata", () => {
  // The header as Refusal builds it for the MCP path; the next test sends it
  // through the MCP face.
  const refusal = new Refusal(403, "insufficient_scope", "the token covers scope \"recovery\", not \"cgm\"", { scope: "cgm" });
  const res = refusal.response({ resourceMetadata: METADATA_URL });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("www-authenticate"),
    `Bearer error="insufficient_scope", scope="cgm", resource_metadata="${METADATA_URL}"`);
});

function mcpToolCall(args, token = "lc_good") {
  return sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "read_scope", arguments: args } }),
    }),
    env: ENV,
  });
}

test("MCP, a single call for another scope: 403 with error, scope and resource_metadata, nothing recorded", async () => {
  const calls = sandbox(ACTIVE);
  const res = await mcpToolCall({ scope: "cgm", owner: OWNER });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("www-authenticate"),
    `Bearer error="insufficient_scope", scope="cgm", resource_metadata="${METADATA_URL}"`);
  assert.deepEqual(await res.json(), {
    detail: 'the token covers scope "recovery", not "cgm"', error: "insufficient_scope",
  });
  assert.equal(calls.record, 0);
});

test("MCP, a wrong owner or an unknown scope: a tool error, HTTP 200, no challenge", async () => {
  sandbox(ACTIVE);
  for (const [args, error] of [
    [{ scope: "recovery", owner: "did:web:other" }, "wrong_subject"],
    [{ scope: "told_to_guardian", owner: OWNER }, "unknown_scope"],
  ]) {
    const res = await mcpToolCall(args);
    assert.equal(res.status, 200, error);
    assert.equal(res.headers.get("www-authenticate"), null, error);
    const result = (await res.json()).result;
    assert.equal(result.isError, true, error);
    assert.equal(result.structuredContent.error, error);
  }
});

test("other 403s (wrong_token_type, wrong_subject) keep no challenge", async () => {
  sandbox(ACTIVE);
  const res = await sourceRequest({
    request: new Request(`${ORIGIN}/sandbox-source/v1/source/recovery?owner=did:web:other`,
      { headers: { authorization: "Bearer lc_good" } }),
    env: ENV,
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("www-authenticate"), null);
});

// ------------------------------------------------------------ audience

const RESOURCE = ORIGIN + "/sandbox-source/mcp";

const MCP_READ_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
  params: { name: "read_scope", arguments: { scope: "recovery", owner: OWNER } } });

function mcpRead(token = "lc_good") {
  return sourceRequest({
    request: new Request(RESOURCE, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token, "content-length": String(MCP_READ_BODY.length) },
      body: MCP_READ_BODY,
    }),
    env: ENV,
  });
}

test("aud equal to the MCP resource is accepted on REST and MCP, and the read is recorded", async () => {
  const calls = sandbox({ ...ACTIVE, aud: RESOURCE });
  const rest = await restRead("recovery");
  assert.equal(rest.status, 200);
  const mcp = await mcpRead();
  assert.equal(mcp.status, 200);
  assert.notEqual((await mcp.json()).result.isError, true);
  assert.equal(calls.record, 2);
});

test("aud as a list that names the resource is accepted", async () => {
  sandbox({ ...ACTIVE, aud: ["https://other.example/mcp", RESOURCE] });
  assert.equal((await restRead("recovery")).status, 200);
});

test("no aud (a /v1/token token) is refused up front, on REST and MCP, and nothing is written", async () => {
  const { aud, ...noAud } = ACTIVE;
  const calls = sandbox(noAud);
  const rest = await restRead("recovery");
  assert.equal(rest.status, 401);
  assert.match(JSON.stringify(await rest.json()), /requires a token with an audience; take your token through the code flow/);
  assert.equal((await mcpRead()).status, 401);
  assert.equal(calls.record, 0);
});

test("aud for another resource: 401 invalid_token with the challenge, on REST, and nothing is written", async () => {
  const calls = sandbox({ ...ACTIVE, aud: "https://other.example/sandbox-source/mcp" });
  const res = await restRead("recovery");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), 'Bearer error="invalid_token", scope="recovery"');
  assert.deepEqual(await res.json(), {
    detail: "the token was issued for another resource", error: "invalid_token",
  });
  assert.equal(calls.record, 0);
});

test("aud for another resource: 401 invalid_token with the challenge, on MCP, and nothing is written", async () => {
  const calls = sandbox({ ...ACTIVE, aud: "https://other.example/sandbox-source/mcp" });
  const res = await mcpRead();
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"),
    `Bearer resource_metadata="${METADATA_URL}", error="invalid_token", scope="recovery"`);
  assert.deepEqual(await res.json(), {
    detail: "the token was issued for another resource", error: "invalid_token",
  });
  assert.equal(calls.record, 0);
});

test("the REST face checks the MCP resource identifier, not its own path", async () => {
  sandbox({ ...ACTIVE, aud: ORIGIN + "/sandbox-source" });
  assert.equal((await restRead("recovery")).status, 401);
  sandbox({ ...ACTIVE, aud: ORIGIN + "/sandbox-source/" });
  assert.equal((await restRead("recovery")).status, 401);
});

test("the identifier follows the request's origin: a token for the hosted source is refused elsewhere", async () => {
  const calls = sandbox({ ...ACTIVE, aud: RESOURCE });
  const res = await sourceRequest({
    request: new Request(`https://abc123.lifecareid.pages.dev/sandbox-source/v1/source/recovery?owner=${encodeURIComponent(OWNER)}`,
      { headers: { authorization: "Bearer lc_good" } }),
    env: ENV,
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).detail, "the token was issued for another resource");
  assert.equal(calls.record, 0);
});

test("a malformed aud (empty, not a string) is a mismatch, not a pass", async () => {
  for (const aud of ["", 7, {}, []]) {
    sandbox({ ...ACTIVE, aud });
    assert.equal((await restRead("recovery")).status, 401, JSON.stringify(aud));
  }
});

test("the version is 0.3.2 and the descriptor shows it", async () => {
  assert.equal(VERSION, "0.3.2");
  const body = await (await sourceRequest({ request: new Request(ORIGIN + "/sandbox-source/"), env: ENV })).json();
  assert.equal(body.version, "0.3.2");
});

// ------------------------------------------------------------ CORS: a browser client reads the challenge

// The Fetch standard lets a cross-origin script read only the CORS-safelisted
// response headers, and WWW-Authenticate is not one of them, so the source names
// it (and the two MCP headers) in access-control-expose-headers.
const EXPOSED = "www-authenticate, mcp-session-id, mcp-protocol-version";
const exposed = (res) => res.headers.get("access-control-expose-headers");

function activeToken(extra = {}) {
  globalThis.fetch = async () => new Response(JSON.stringify({
    active: true, token_type: "access", resource_owner: "did:web:sandbox.example:u:817612d13f3219b6",
    scope: "recovery", expires_at: "2999-01-01T00:00:00+00:00",
    aud: "https://lifecare.id/sandbox-source/mcp", ...extra,
  }), { status: 200 });
}

test("CORS: the bare 401 on the MCP path exposes WWW-Authenticate", async () => {
  const res = await mcpCall(null);
  assert.equal(res.status, 401);
  assert.equal(exposed(res), EXPOSED);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("CORS: the presented-token 401 exposes WWW-Authenticate", async () => {
  inactiveSandbox();
  const res = await mcpCall("lc_revoked");
  assert.equal(res.status, 401);
  assert.equal(exposed(res), EXPOSED);
});

test("CORS: the single-call 403 insufficient_scope exposes WWW-Authenticate", async () => {
  activeToken();
  const res = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer lc_recovery_only" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "read_scope", arguments: { scope: "cgm", owner: "did:web:sandbox.example:u:817612d13f3219b6" } },
      }),
    }),
    env: ENV,
  });
  assert.equal(res.status, 403);
  assert.match(res.headers.get("www-authenticate"), /error="insufficient_scope"/);
  assert.equal(exposed(res), EXPOSED);
});

test("CORS: the REST 403 exposes WWW-Authenticate", async () => {
  activeToken();
  const res = await sourceRequest({
    request: new Request(
      ORIGIN + "/sandbox-source/v1/source/cgm?owner=did%3Aweb%3Asandbox.example%3Au%3A817612d13f3219b6",
      { headers: { authorization: "Bearer lc_recovery_only" } }),
    env: ENV,
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "insufficient_scope");
  assert.equal(exposed(res), EXPOSED);
});

test("CORS: the metadata GET exposes WWW-Authenticate too", async () => {
  const res = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp");
  assert.equal(res.status, 200);
  assert.equal(exposed(res), EXPOSED);
});

test("CORS: the preflight answers expose it, on the source and on the metadata", async () => {
  const preflight = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/mcp", { method: "OPTIONS" }), env: ENV,
  });
  assert.equal(preflight.status, 204);
  assert.equal(exposed(preflight), EXPOSED);
  const metadata = await wellKnown("/.well-known/oauth-protected-resource/sandbox-source/mcp", { method: "OPTIONS" });
  assert.equal(metadata.status, 204);
  assert.equal(exposed(metadata), EXPOSED);
});

test("CORS: the 308 to the canonical MCP path exposes it, and the origin stays *", async () => {
  const res = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/mcp/", { method: "POST", body: "{}" }), env: ENV,
  });
  assert.equal(res.status, 308);
  assert.equal(exposed(res), EXPOSED);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("access-control-allow-credentials"), null);
});
