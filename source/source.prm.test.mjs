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
import { SCOPES } from "./source.js";

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

test("MCP, no token: 401 with a bare Bearer challenge carrying resource_metadata", async () => {
  const res = await mcpCall(null);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), `Bearer resource_metadata="${METADATA_URL}"`);
  assert.equal((await res.json()).error, "missing_token");
});

test("MCP, a refused token: the challenge adds error=invalid_token", async () => {
  inactiveSandbox();
  const res = await mcpCall("lc_revoked");
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"),
    `Bearer resource_metadata="${METADATA_URL}", error="invalid_token"`);
  assert.equal((await res.json()).error, "invalid_token");
});

test("MCP, an oversized token is refused before the sandbox is asked, with the same challenge", async () => {
  globalThis.fetch = async () => { throw new Error("the sandbox must not be asked"); };
  const res = await mcpCall("x".repeat(600));
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /resource_metadata=".*", error="invalid_token"$/);
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
    'Bearer resource_metadata="https://abc123.lifecareid.pages.dev/.well-known/oauth-protected-resource/sandbox-source/mcp"');
});

test("a trailing slash on the MCP path is a 308 to the canonical path, so the challenge always matches the URL", async () => {
  const res = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/mcp/?x=1", { method: "POST", body: "{}" }),
    env: ENV,
  });
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), ORIGIN + "/sandbox-source/mcp?x=1");
});

test("REST 401s keep a plain challenge: the document describes the MCP resource only", async () => {
  const res = await sourceRequest({
    request: new Request(ORIGIN + "/sandbox-source/v1/scopes"), env: ENV,
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("www-authenticate"), "Bearer");
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
