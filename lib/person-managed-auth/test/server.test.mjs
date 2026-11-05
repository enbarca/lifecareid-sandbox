// The server half: metadata, the 401 challenge, the token checks at every
// request, the step-up refusal, the receipt, and the two runtime adapters.
// Run: node --test (from the kit root or this folder). No SDK needed.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createResourceServer, Refusal } from "../src/server.js";
import { pagesFunction } from "../src/pages.js";
import { challengeParams } from "../src/shared.js";
import { startIssuer, startResource } from "./helpers.mjs";

const OWNER = "did:web:example.test:u:synthetic01";

// A token the mock issuer will vouch for, as the issuer would have minted it.
function mint(issuer, resource, over = {}) {
  const consent = over.consent_id || "urn:lifecare:consent:test" + issuer.tokens.size;
  const token = "lc_test" + issuer.tokens.size + Math.random().toString(36).slice(2);
  issuer.tokens.set(token, {
    consent_id: consent, scope: "daily", owner: OWNER, requester: over.requester || "sbx_agent",
    purpose: "synthetic purpose", aud: resource, expires_at: Date.now() + 60_000, ...over.token,
  });
  issuer.grants.set(consent, { revoked: false });
  return { token, consent };
}

const post = (url, token, body = { jsonrpc: "2.0", id: 1, method: "tools/list" }) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
const read = (url, token, scope) =>
  post(url, token, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_scope", arguments: { scope } } });

test("the metadata names the resource and the authorization server, in the path form of RFC 9728", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    assert.equal(r.server.metadataPath, "/.well-known/oauth-protected-resource/mcp");
    const res = await fetch(r.origin + r.server.metadataPath);
    assert.equal(res.status, 200);
    const doc = await res.json();
    assert.equal(doc.resource, r.resource);
    assert.deepEqual(doc.authorization_servers, [issuer.origin]);
    assert.deepEqual(doc.bearer_methods_supported, ["header"]);
    assert.deepEqual(doc.scopes_supported, ["daily", "cgm", "recovery"]);
    // a resource with no path publishes at the root form
    const root = createResourceServer({ resource: "https://api.example.test", authorizationServer: "https://as.example.test",
      clientId: "a", clientSecret: "b", scopes: ["daily"], grantees: "any" });
    assert.equal(root.metadataPath, "/.well-known/oauth-protected-resource");
    assert.equal((await root.metadataResponse({ method: "OPTIONS" })).status, 204);
    assert.equal((await root.metadataResponse({ method: "POST" })).status, 405);
  } finally { await r.close(); await issuer.close(); }
});

test("no token: 401 with the resource_metadata challenge and the one scope the server suggests, and no introspection", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer, { scope: "daily" });
  try {
    const res = await post(r.resource);
    assert.equal(res.status, 401);
    const header = res.headers.get("www-authenticate");
    assert.equal(header, `Bearer resource_metadata="${r.origin}/.well-known/oauth-protected-resource/mcp", scope="daily"`);
    assert.deepEqual(await res.json(), { detail: "present an access token as Authorization: Bearer <token>", error: "missing_token" });
    assert.equal(issuer.log.filter((e) => e.path === "/v1/token/introspect").length, 0);
  } finally { await r.close(); await issuer.close(); }
});

test("a token the issuer calls inactive: 401 invalid_token, with the one scope suggested", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const res = await post(r.resource, "lc_unknown");
    assert.equal(res.status, 401);
    const p = challengeParams(res.headers.get("www-authenticate"));
    assert.equal(p.error, "invalid_token");
    assert.equal(p.scope, "daily");
    assert.ok(p.resource_metadata.endsWith("/.well-known/oauth-protected-resource/mcp"));
  } finally { await r.close(); await issuer.close(); }
});

// One test per 401 case: the challenge names `scope`, `error` is as before.
test("every 401 case names the one scope, with the same error as before", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const want = (error) => `Bearer resource_metadata="${r.origin}/.well-known/oauth-protected-resource/mcp", ${error ? `error="${error}", ` : ""}scope="daily"`;
    const check = async (res, error, detail) => {
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("www-authenticate"), want(error));
      assert.equal(res.headers.get("access-control-expose-headers"), "WWW-Authenticate");
      assert.deepEqual(await res.json(), { detail, error: error || "missing_token" });
    };
    await check(await post(r.resource), null, "present an access token as Authorization: Bearer <token>");
    await check(await post(r.resource, "x".repeat(5000)), "invalid_token", "token inactive or unknown");
    const expired = mint(issuer, r.resource, { token: { expires_at: Date.now() - 1000 } });
    await check(await post(r.resource, expired.token), "invalid_token", "token inactive or unknown");
    const revoked = mint(issuer, r.resource);
    issuer.revoke(revoked.consent);
    await check(await post(r.resource, revoked.token), "invalid_token", "token inactive or unknown");
    const other = mint(issuer, "https://other.example.test/mcp");
    await check(await post(r.resource, other.token), "invalid_token", "the token was issued for another resource");
  } finally { await r.close(); await issuer.close(); }
});

test("a read of cgm with an expired token suggests cgm, not the default", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer, { scope: "daily" });
  try {
    const expired = mint(issuer, r.resource, { token: { expires_at: Date.now() - 1000 } });
    const res = await read(r.resource, expired.token, "cgm");
    assert.equal(res.status, 401);
    const p = challengeParams(res.headers.get("www-authenticate"));
    assert.equal(p.error, "invalid_token");
    assert.equal(p.scope, "cgm");
    const none = challengeParams((await read(r.resource, null, "recovery")).headers.get("www-authenticate"));
    assert.equal(none.scope, "recovery");
    const unknown = challengeParams((await read(r.resource, expired.token, "nonsense")).headers.get("www-authenticate"));
    assert.equal(unknown.scope, "daily");
    // an unknown suggest never hides a valid scope, and the challenge never writes one the server does not list
    const s2 = r.server;
    const bad = await s2.authenticate(new Request("http://x/", { headers: { authorization: "Bearer lc_nope" } }),
      { suggest: "nonsense", scope: "cgm" }).catch((e) => e);
    assert.equal(bad.suggest, "cgm");
    assert.match(s2.challenge(new Refusal(401, "invalid_token", "x", { suggest: 'a"b' })), /scope="daily"/);
  } finally { await r.close(); await issuer.close(); }
});

test("the stop holds at the very next request: every request asks the issuer, nothing is cached", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const { token, consent } = mint(issuer, r.resource);
    const asked = () => issuer.log.filter((e) => e.path === "/v1/token/introspect").length;
    assert.equal((await post(r.resource, token)).status, 200);
    assert.equal((await post(r.resource, token)).status, 200);
    assert.equal(asked(), 2, "one introspection per request");
    issuer.revoke(consent);
    const after = await post(r.resource, token);
    assert.equal(after.status, 401);
    assert.equal(challengeParams(after.headers.get("www-authenticate")).error, "invalid_token");
    assert.equal(asked(), 3);
  } finally { await r.close(); await issuer.close(); }
});

test("only an access token: a session token is refused with 403 wrong_token_type", async () => {
  const issuer = await startIssuer({ tokenType: "user" });
  const r = await startResource(issuer);
  try {
    const { token } = mint(issuer, r.resource);
    const res = await post(r.resource, token);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "wrong_token_type");
  } finally { await r.close(); await issuer.close(); }
});

test("the audience, when the token has one, must be this resource", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const wrong = mint(issuer, "https://another.example.test/mcp");
    const res = await post(r.resource, wrong.token);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).detail, "the token was issued for another resource");
    // equal: served; a list that contains it: served
    assert.equal((await post(r.resource, mint(issuer, r.resource).token)).status, 200);
    const listed = mint(issuer, r.resource);
    issuer.tokens.get(listed.token).aud = ["https://another.example.test/mcp", r.resource];
    assert.equal((await post(r.resource, listed.token)).status, 200);
  } finally { await r.close(); await issuer.close(); }
  // no aud on the introspection (the walkthrough's POST /v1/token): served
  const noAud = await startIssuer({ aud: false });
  const r2 = await startResource(noAud);
  try {
    assert.equal((await post(r2.resource, mint(noAud, r2.resource).token)).status, 200);
  } finally { await r2.close(); await noAud.close(); }
});

test("the grantee: own, any, a list, a function; and the option is required", async () => {
  const issuer = await startIssuer();
  for (const missing of [undefined, null, "", "everyone", 3]) {
    assert.throws(() => createResourceServer({ resource: "https://api.example.test/mcp", authorizationServer: "https://as.example.test",
      clientId: "a", clientSecret: "b", scopes: ["daily"], grantees: missing }),
    /grantees is required: "any".*array of client ids.*function.*"own"/);
  }
  const own = await startResource(issuer, { grantees: "own" });
  try {
    // a token issued to some other client is not this server's
    const foreign = mint(issuer, own.resource, { requester: "sbx_someone_else" });
    const res = await post(own.resource, foreign.token);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "wrong_grantee");
    // a token issued to this server's own registered client is
    const mine = mint(issuer, own.resource, { requester: own.client.client_id });
    assert.equal((await post(own.resource, mine.token)).status, 200);
  } finally { await own.close(); }
  const list = await startResource(issuer, { grantees: ["sbx_listed"] });
  try {
    assert.equal((await post(list.resource, mint(issuer, list.resource, { requester: "sbx_listed" }).token)).status, 200);
    assert.equal((await post(list.resource, mint(issuer, list.resource, { requester: "sbx_other" }).token)).status, 403);
  } finally { await list.close(); }
  const fn = await startResource(issuer, { grantees: (id) => id.endsWith("_ok") });
  try {
    assert.equal((await post(fn.resource, mint(issuer, fn.resource, { requester: "sbx_ok" }).token)).status, 200);
    assert.equal((await post(fn.resource, mint(issuer, fn.resource, { requester: "sbx_no" }).token)).status, 403);
    // a token that names no grantee is never accepted, whatever the mode
    const bare = mint(issuer, fn.resource);
    issuer.tokens.get(bare.token).requester = undefined;
    assert.equal((await post(fn.resource, bare.token)).status, 403);
  } finally { await fn.close(); await issuer.close(); }
});

test("a token for another scope is refused on that one call with the 403 step-up header, and nothing is recorded", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const { token } = mint(issuer, r.resource, { token: { scope: "daily" } });
    const ok = await read(r.resource, token, "daily");
    assert.equal(ok.status, 200);
    const before = issuer.ledger.length;
    const res = await read(r.resource, token, "cgm");
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("www-authenticate"),
      `Bearer error="insufficient_scope", scope="cgm", resource_metadata="${r.origin}/.well-known/oauth-protected-resource/mcp"`);
    assert.equal((await res.json()).error, "insufficient_scope");
    assert.equal(issuer.ledger.length, before, "a refused call writes nothing to the ledger");
    // inside a batch one HTTP status cannot speak for several requests: in band
    const batch = await fetch(r.resource, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_scope", arguments: { scope: "cgm" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]) });
    assert.equal(batch.status, 200);
    const items = await batch.json();
    assert.equal(items[0].result.isError, true);
    assert.equal(items[0].result.structuredContent.status, 403);
    assert.equal(items[1].result.tools.length, 1);
  } finally { await r.close(); await issuer.close(); }
});

test("the receipt: one ledger line per read, written before the answer, carrying a reference and a hash and no value", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const { token, consent } = mint(issuer, r.resource);
    const res = await read(r.resource, token, "daily");
    assert.equal(res.status, 200);
    const result = (await res.json()).result;
    const body = result.structuredContent;
    assert.equal(body.consent_id, consent);
    assert.equal(body.access_recorded, true);
    assert.match(body.ledger_entry_hash, /^[0-9a-f]{64}$/);
    assert.equal(issuer.ledger.length, 1);
    // exactly these five fields leave the server, and the accessor is the one configured
    assert.deepEqual(Object.keys(issuer.ledger[0]).sort(), ["accessor", "by", "consent_id", "purpose", "scope", "subject_did"]);
    assert.equal(issuer.ledger[0].accessor, "example-mcp");
    assert.equal(issuer.ledger[0].consent_id, consent);
    // initialize and tools/list are authorized but are not reads
    await post(r.resource, token);
    assert.equal(issuer.ledger.length, 1);
  } finally { await r.close(); await issuer.close(); }
});

test("a read that cannot be written to the ledger is not served", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const { token } = mint(issuer, r.resource);
    const server = createResourceServer({ resource: r.resource, authorizationServer: issuer.origin, clientId: r.client.client_id,
      clientSecret: r.client.client_secret, scopes: ["daily"], grantees: "any",
      fetch: async (url, init) => (String(url).endsWith("/v1/access/record") ? new Response("no", { status: 500 }) : fetch(url, init)) });
    let served = false;
    const handler = server.protect(async () => { served = true; return { ok: true }; }, { scope: "daily" });
    const res = await handler(new Request(r.resource, { headers: { authorization: "Bearer " + token } }));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "access_record_failed");
    assert.equal(served, false);
  } finally { await r.close(); await issuer.close(); }
});

test("protect() adds the receipt to a plain object and passes a Response through", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const { token } = mint(issuer, r.resource);
    const asObject = r.server.protect(async (_req, { grant }) => ({ owner: grant.owner, band: "drifting" }), { scope: "daily" });
    const body = await (await asObject(new Request(r.resource, { headers: { authorization: "Bearer " + token } }))).json();
    assert.equal(body.band, "drifting");
    assert.equal(body.access_recorded, true);
    assert.ok(body.ledger_entry_hash && body.consent_id);
    const asResponse = r.server.protect(async () => new Response("plain", { status: 201 }));
    const res = await asResponse(new Request(r.resource, { headers: { authorization: "Bearer " + token } }));
    assert.equal(res.status, 201);
    assert.equal(await res.text(), "plain");
  } finally { await r.close(); await issuer.close(); }
});

test("the issuer cannot be asked, or refuses this server's own credentials: nothing is served (503)", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  const wrongSecret = createResourceServer({ resource: r.resource, authorizationServer: issuer.origin,
    clientId: r.client.client_id, clientSecret: "wrong", scopes: ["daily"], grantees: "any" });
  const down = createResourceServer({ resource: r.resource, authorizationServer: "http://127.0.0.1:1",
    clientId: "a", clientSecret: "b", scopes: ["daily"], grantees: "any", timeoutMs: 500 });
  try {
    const { token } = mint(issuer, r.resource);
    const req = () => new Request(r.resource, { headers: { authorization: "Bearer " + token } });
    const h = (s) => s.protect(async () => ({ leaked: true }));
    const a = await h(wrongSecret)(req());
    assert.equal(a.status, 503);
    assert.equal((await a.json()).error, "server_not_authorized");
    const b = await h(down)(req());
    assert.equal(b.status, 503);
    assert.equal((await b.json()).error, "introspection_unavailable");
  } finally { await r.close(); await issuer.close(); }
});

test("the client secret goes only to the issuer's origin, and only as Basic", async () => {
  assert.throws(() => createResourceServer({ resource: "https://api.example.test/mcp", authorizationServer: "https://as.example.test",
    clientId: "a", clientSecret: "b", scopes: ["daily"], grantees: "any", introspectionEndpoint: "https://elsewhere.example.test/introspect" }),
  /issuer's origin/);
  assert.throws(() => createResourceServer({ resource: "http://api.example.test/mcp", authorizationServer: "https://as.example.test",
    clientId: "a", clientSecret: "b", scopes: ["daily"] }), /https/);
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const { token } = mint(issuer, r.resource);
    const res = await post(r.resource, token);
    assert.ok(!JSON.stringify(await res.json()).includes(r.client.client_secret));
    const calls = issuer.log.filter((e) => e.path.startsWith("/v1/"));
    assert.ok(calls.length > 0 && calls.every((e) => e.hadBasic && !e.bodyHasSecret));
  } finally { await r.close(); await issuer.close(); }
});

test("a Refusal thrown by the app's own code is answered like the library's, and a crash says nothing about its cause", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer);
  try {
    const handler = r.server.route(async () => { throw new Refusal(404, "unknown_scope", "unknown scope"); });
    const nf = await handler(new Request(r.origin + "/x"));
    assert.equal(nf.status, 404);
    const crash = r.server.route(async () => { throw new Error("secret detail: " + r.client.client_secret); });
    const res = await crash(new Request(r.origin + "/x"));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { detail: "internal error", error: "internal_error" });
  } finally { await r.close(); await issuer.close(); }
});

test("the Cloudflare Pages Function adapter: a factory over env, the metadata path and the protected path", async () => {
  const issuer = await startIssuer();
  const own = issuer.registerClient("pages");
  const env = { PMA_CLIENT_ID: own.client_id, PMA_CLIENT_SECRET: own.client_secret };
  const onRequest = pagesFunction(
    (e) => createResourceServer({ resource: "https://pages.example.test/api/read", authorizationServer: issuer.origin,
      clientId: e.PMA_CLIENT_ID, clientSecret: e.PMA_CLIENT_SECRET, scopes: ["daily"], grantees: "any" }),
    async (_req, { grant }) => ({ band: "drifting", for: grant.scope }),
    { scope: "daily" });
  try {
    const meta = await onRequest({ request: new Request("https://pages.example.test/.well-known/oauth-protected-resource/api/read"), env });
    assert.equal(meta.status, 200);
    assert.equal((await meta.json()).resource, "https://pages.example.test/api/read");
    const none = await onRequest({ request: new Request("https://pages.example.test/api/read"), env });
    assert.equal(none.status, 401);
    const { token } = mint(issuer, "https://pages.example.test/api/read");
    const ok = await onRequest({ request: new Request("https://pages.example.test/api/read", { headers: { authorization: "Bearer " + token } }), env });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.for, "daily");
    assert.equal(body.access_recorded, true);
  } finally { await issuer.close(); }
});

test("the Node adapter serves the metadata and the protected route over real HTTP", async () => {
  const issuer = await startIssuer();
  const r = await startResource(issuer, { raw: false });
  try {
    assert.equal((await fetch(r.origin + r.server.metadataPath)).status, 200);
    assert.equal((await fetch(r.origin + "/anything")).status, 401);
  } finally { await r.close(); await issuer.close(); }
});
