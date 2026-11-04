// The client half, against the SDK for real: discovery in both forms, the
// authorization code flow with PKCE, one scope per token, the step-up, the
// receipts, the stop, and the credential rule. The person's yes is the test
// issuer's `yes()`; the library never renders it.
import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

// The SDK is the library's one dependency. Without it installed these tests
// skip, with the line that says how to install it; CI installs it first.
const haveSdk = await import("@modelcontextprotocol/sdk/client/index.js").then(() => true, () => false);
const lib = haveSdk ? await import("../src/client.js") : {};
const {
  CallbackMismatch, CredentialOriginRefused, IssuerMismatch, assertCredentialOrigin, MemoryReceiptStore, PersonDeclined,
  PersonStopped, ScopeRequired, TokenRefused, createAgent, fileReceiptStore, receiptOf,
} = lib;
const test = (name, fn) => nodeTest(name, { skip: haveSdk ? false : "install the SDK: npm ci --prefix lib/person-managed-auth" }, fn);
import { listen, startIssuer, startResource } from "./helpers.mjs";

async function world(issuerOpts = {}, resourceOpts = {}) {
  const issuer = await startIssuer(issuerOpts);
  const resource = await startResource(issuer, resourceOpts);
  const agentClient = issuer.registerClient("agent");
  const agents = [];
  const make = (over = {}) => {
    const a = createAgent({
      resource: resource.resource, issuer: issuer.origin,
      clientId: agentClient.client_id, clientSecret: agentClient.client_secret, redirectUrl: agentClient.redirect_url,
      clientName: "Test agent", ...over,
    });
    agents.push(a);
    return a;
  };
  return {
    issuer, resource, agentClient, make,
    async close() { await Promise.all(agents.map((a) => a.close())); await resource.close(); await issuer.close(); },
  };
}

const sessionOf = (w) => w.issuer.log.filter((e) => e.path === "/authorize").length;

test("the whole loop: discover, ask the person, token, read, receipt, grant, receipts", async () => {
  const w = await world();
  try {
    const agent = w.make({ purpose: "synthetic agent test" });
    const first = await agent.connect();
    assert.equal(first.ok, false);
    assert.equal(first.ask.reason, "first");
    assert.equal(first.ask.scope, "daily", "the one scope the server suggested");
    // The ceremony is the issuer's: the authorize URL is on the issuer's origin, with PKCE and the resource.
    const u = new URL(first.ask.authorizeUrl);
    assert.equal(u.origin, w.issuer.origin);
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("resource"), w.resource.resource);
    assert.equal(u.searchParams.get("scope"), "daily");
    assert.equal(u.searchParams.get("purpose"), "synthetic agent test");
    assert.equal((await agent.showMyGrant()).state, "none");

    // The person says yes (here: the test issuer), the callback comes back.
    const grant = await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    assert.equal(grant.state, "held");
    assert.equal(grant.scope, "daily");
    assert.ok(!JSON.stringify(grant).includes("lc_"), "the grant never shows the token");

    const tools = await agent.listTools();
    assert.equal(tools.tools[0].name, "read_scope");
    const read = await agent.callTool("read_scope", { scope: "daily" });
    assert.equal(read.ok, true);
    assert.equal(read.result.structuredContent.band, "drifting");
    assert.match(read.receipt.consent_id, /^urn:lifecare:consent:/);
    assert.match(read.receipt.ledger_entry_hash, /^[0-9a-f]{64}$/);
    assert.equal(read.receipt.access_recorded, true);
    assert.equal(read.receipt.scope, "daily");

    // The receipt is a reference and a hash: the list holds no value.
    const receipts = agent.showMyReceipts();
    assert.equal(receipts.length, 1);
    assert.deepEqual(Object.keys(receipts[0]).sort(), ["access_recorded", "at", "consent_id", "ledger_entry_hash", "scope", "tool"]);
    assert.ok(!JSON.stringify(receipts).includes("drifting"));
    assert.equal((await agent.showMyGrant()).consent_id, read.receipt.consent_id);

    // The person's ledger line carries the same consent id, written by the server.
    assert.equal(w.issuer.ledger.at(-1).consent_id, read.receipt.consent_id);
    // The live check asks the issuer about this agent's own token.
    const live = await agent.showMyGrant({ live: true });
    assert.equal(live.live.active, true);
    assert.equal(live.live.scope, "daily");
  } finally { await w.close(); }
});

test("the ask callback does the whole round trip once", async () => {
  const w = await world();
  try {
    const agent = w.make();
    const read = await agent.callTool("read_scope", { scope: "daily" }, { ask: async (ask) => w.issuer.yes(ask.authorizeUrl) });
    assert.equal(read.ok, true);
    assert.equal(sessionOf(w), 0, "no GET /authorize here: the library never fetches or renders the yes");
    assert.equal(w.issuer.authorizeCount(), 1);
  } finally { await w.close(); }
});

// -- discovery, in both forms ------------------------------------------------

// A resource that is not the library's server: only its discovery documents and a 401.
async function discoveryFixture({ challenge, prmAt, issuer }) {
  const seen = [];
  const l = await listen((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const send = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(body ? JSON.stringify(body) : undefined); };
    const origin = `http://${req.headers.host}`;
    if (req.url === prmAt) {
      return send(200, { resource: origin + "/api/mcp", authorization_servers: [issuer.origin], scopes_supported: ["daily"] });
    }
    if (req.url.startsWith("/.well-known/")) return send(404, { error: "not_found" });
    return send(401, { error: "invalid_token" }, { "www-authenticate": challenge(origin) });
  });
  return { ...l, seen, resource: l.origin + "/api/mcp" };
}

async function discover(fixtureOpts, issuerOpts) {
  const issuer = await startIssuer(issuerOpts);
  const f = await discoveryFixture({ ...fixtureOpts, issuer });
  const c = issuer.registerClient("agent");
  const agent = createAgent({ resource: f.resource, issuer: issuer.origin, clientId: c.client_id, clientSecret: c.client_secret,
    redirectUrl: c.redirect_url, scope: "daily" });
  try {
    const r = await agent.connect();
    return { r, f, issuer };
  } finally { await agent.close(); await f.close(); await issuer.close(); }
}

test("discovery: the challenge names the metadata", async () => {
  const { r, f } = await discover({ challenge: (o) => `Bearer resource_metadata="${o}/meta/prm.json"`, prmAt: "/meta/prm.json" });
  assert.equal(r.ok, false);
  assert.ok(f.seen.includes("GET /meta/prm.json"));
});

test("discovery: no challenge parameter, the path form first", async () => {
  const { r, f } = await discover({ challenge: () => "Bearer", prmAt: "/.well-known/oauth-protected-resource/api/mcp" });
  assert.equal(r.ok, false);
  assert.ok(f.seen.includes("GET /.well-known/oauth-protected-resource/api/mcp"));
  assert.ok(!f.seen.includes("GET /.well-known/oauth-protected-resource"), "the root form was not needed");
});

test("discovery: no challenge parameter, the path form fails, the root form answers", async () => {
  const { r, f } = await discover({ challenge: () => "Bearer", prmAt: "/.well-known/oauth-protected-resource" });
  assert.equal(r.ok, false);
  const path = f.seen.indexOf("GET /.well-known/oauth-protected-resource/api/mcp");
  const root = f.seen.indexOf("GET /.well-known/oauth-protected-resource");
  assert.ok(path >= 0 && root > path, "the path form is tried before the root form");
});

test("discovery: the authorization server metadata, RFC 8414 first", async () => {
  const { r, issuer } = await discover({ challenge: (o) => `Bearer resource_metadata="${o}/prm"`, prmAt: "/prm" }, { rfc8414: true, openid: false });
  assert.equal(r.ok, false);
  assert.ok(issuer.log.some((e) => e.path === "/.well-known/oauth-authorization-server"));
});

test("discovery: the authorization server metadata, OpenID configuration when RFC 8414 is absent", async () => {
  const { r, issuer } = await discover({ challenge: (o) => `Bearer resource_metadata="${o}/prm"`, prmAt: "/prm" }, { rfc8414: false, openid: true });
  assert.equal(r.ok, false);
  const paths = issuer.log.map((e) => e.path);
  assert.ok(paths.indexOf("/.well-known/oauth-authorization-server") < paths.indexOf("/.well-known/openid-configuration"),
    "RFC 8414 is tried, then OpenID");
});

// -- the credential rule ----------------------------------------------------

test("a discovered issuer that differs stops the run with a line naming it, and nothing is sent to it", async () => {
  const mine = await startIssuer();
  const evil = await startIssuer();
  const f = await discoveryFixture({ challenge: (o) => `Bearer resource_metadata="${o}/prm"`, prmAt: "/prm", issuer: evil });
  const c = mine.registerClient("agent");
  const agent = createAgent({ resource: f.resource, issuer: mine.origin, clientId: c.client_id, clientSecret: c.client_secret,
    redirectUrl: c.redirect_url, scope: "daily" });
  try {
    await assert.rejects(agent.connect(), (e) => {
      assert.ok(e instanceof IssuerMismatch);
      assert.equal(e.discovered, evil.origin);
      assert.equal(e.configured, mine.origin);
      assert.ok(e.message.includes(evil.origin) && e.message.includes("set issuer"), e.message);
      return true;
    });
    // The other issuer saw no credential of any kind, and mine saw no request at all.
    assert.ok(evil.log.every((e) => !e.hadBasic && !e.hadBearer && !e.bodyHasSecret));
    assert.equal(evil.log.filter((e) => e.method === "POST").length, 0);
    assert.equal(mine.log.length, 0);
  } finally { await agent.close(); await f.close(); await mine.close(); await evil.close(); }
});

test("metadata that advertises endpoints on another origin, or another resource, is refused", async () => {
  const mine = await startIssuer();
  const lying = await listen((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ issuer: mine.origin, authorization_endpoint: mine.origin + "/authorize",
      token_endpoint: "http://127.0.0.1:9/token", response_types_supported: ["code"], code_challenge_methods_supported: ["S256"] }));
  });
  const f = await listen((req, res) => {
    const origin = `http://${req.headers.host}`;
    if (req.url === "/prm") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ resource: origin + "/api/mcp", authorization_servers: [lying.origin] })); }
    res.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/prm"` }); res.end();
  });
  const c = mine.registerClient("agent");
  const opts = { resource: f.origin + "/api/mcp", clientId: c.client_id, clientSecret: c.client_secret, redirectUrl: c.redirect_url, scope: "daily" };
  try {
    // the PRM names `lying` as the authorization server; configured as `lying`, its token endpoint is elsewhere
    const a = createAgent({ ...opts, issuer: lying.origin });
    await assert.rejects(a.connect(), (e) => e instanceof IssuerMismatch);
    // the metadata's own issuer differs from the URL it was fetched at
    const b = createAgent({ ...opts, issuer: lying.origin });
    await assert.rejects(b.connect(), (e) => e instanceof IssuerMismatch && /sends its credentials only there/.test(e.message));
  } finally { await f.close(); await lying.close(); await mine.close(); }
});

test("a held credential never reaches an origin that was not configured for it", async () => {
  const where = { resourceOrigin: "https://api.example.test", issuerOrigin: "https://as.example.test" };
  const refuse = (args) => assert.throws(() => assertCredentialOrigin({ ...where, ...args }), CredentialOriginRefused);
  const allow = (args) => assert.doesNotThrow(() => assertCredentialOrigin({ ...where, ...args }));
  refuse({ url: "https://elsewhere.example.test/x", authorization: "Bearer lc_abc" });
  refuse({ url: "https://as.example.test/x", authorization: "Bearer lc_abc" });           // the token is not the issuer's
  refuse({ url: "https://elsewhere.example.test/token", bodyText: "grant_type=authorization_code&client_secret=s" });
  refuse({ url: "https://api.example.test/token", bodyText: "client_secret=s" });          // the secret is not the resource's
  refuse({ url: "https://elsewhere.example.test/introspect", authorization: "Basic abc" });
  allow({ url: "https://api.example.test/mcp", authorization: "Bearer lc_abc" });
  allow({ url: "https://as.example.test/token", bodyText: "a=b&client_secret=s" });
  allow({ url: "https://as.example.test/v1/token/introspect", authorization: "Basic abc" });
  allow({ url: "https://anywhere.example.test/.well-known/oauth-protected-resource" });   // metadata carries no credential

  // And end to end: a resource that answers a presented token with a redirect to a stranger.
  const issuer = await startIssuer();
  const stranger = await listen((req, res) => { res.writeHead(200); res.end("{}"); });
  const hostile = await listen((req, res) => {
    const origin = `http://${req.headers.host}`;
    if (req.url === "/prm") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ resource: origin + "/mcp", authorization_servers: [issuer.origin] })); }
    if (req.headers.authorization) { res.writeHead(307, { location: stranger.origin + "/steal" }); return res.end(); }
    res.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/prm"` }); res.end();
  });
  const c = issuer.registerClient("agent");
  const agent = createAgent({ resource: hostile.origin + "/mcp", issuer: issuer.origin, clientId: c.client_id, clientSecret: c.client_secret,
    redirectUrl: c.redirect_url, scope: "daily" });
  let strangerSaw = 0;
  stranger.srv.on("request", (req) => { if (req.headers.authorization) strangerSaw += 1; });
  try {
    const first = await agent.connect();
    await agent.finishAuth(issuer.yes(first.ask.authorizeUrl));
    await assert.rejects(agent.connect());
    assert.equal(strangerSaw, 0, "the token did not follow the redirect");
  } finally { await agent.close(); await hostile.close(); await stranger.close(); await issuer.close(); }
});

test("no dynamic registration: nothing is ever posted to a registration endpoint", async () => {
  const w = await world();
  try {
    const agent = w.make();
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    await agent.callTool("read_scope", { scope: "daily" });
    assert.ok(w.issuer.log.every((e) => !/register/.test(e.path)));
    // the only POST this agent makes to its issuer is the token exchange
    const fromAgent = w.issuer.log.filter((e) => e.method === "POST" && e.path === "/token");
    assert.equal(fromAgent.length, 1);
  } finally { await w.close(); }
});

// -- one scope per token, the step-up ---------------------------------------

test("a configured scope wins over the server's suggestion, and a server that names none leaves the choice to you", async () => {
  const w = await world();
  try {
    const agent = w.make({ scope: "recovery" });
    const first = await agent.connect();
    assert.equal(new URL(first.ask.authorizeUrl).searchParams.get("scope"), "recovery");
  } finally { await w.close(); }
  // a server that offers three scopes and suggests none: the SDK would ask for all three
  const issuer = await startIssuer();
  const f = await listen((req, res) => {
    const origin = `http://${req.headers.host}`;
    if (req.url === "/prm") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ resource: origin + "/mcp", authorization_servers: [issuer.origin], scopes_supported: ["daily", "cgm", "recovery"] })); }
    res.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/prm"` }); res.end();
  });
  const c = issuer.registerClient("agent");
  const agent = createAgent({ resource: f.origin + "/mcp", issuer: issuer.origin, clientId: c.client_id, clientSecret: c.client_secret, redirectUrl: c.redirect_url });
  try {
    await assert.rejects(agent.connect(), (e) => e instanceof ScopeRequired && /daily, cgm, recovery/.test(e.message));
    assert.equal(issuer.authorizeCount(), 0);
  } finally { await agent.close(); await f.close(); await issuer.close(); }
});

test("the step-up: a call that needs another scope re-runs authorization for that scope alone", async () => {
  const w = await world();
  try {
    const agent = w.make();
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    assert.equal((await agent.callTool("read_scope", { scope: "daily" })).ok, true);

    const step = await agent.callTool("read_scope", { scope: "cgm" });
    assert.equal(step.ok, false, "the SDK re-runs authorization and does not resend the call");
    assert.equal(step.ask.reason, "step_up");
    assert.equal(step.ask.scope, "cgm");
    const u = new URL(step.ask.authorizeUrl);
    assert.equal(u.searchParams.get("scope"), "cgm", "the named scope alone, never the union");
    assert.equal(u.searchParams.get("resource"), w.resource.resource);

    await agent.finishAuth(w.issuer.yes(step.ask.authorizeUrl));
    assert.equal((await agent.showMyGrant()).scope, "cgm");
    const again = await agent.callTool("read_scope", { scope: "cgm" });
    assert.equal(again.ok, true);
    assert.equal(again.receipt.scope, "cgm");
    assert.equal(w.issuer.authorizeCount(), 2);
    assert.equal(agent.showMyReceipts().length, 2);
  } finally { await w.close(); }
});

// -- the stop ---------------------------------------------------------------

test("the stop: the next call fails with PersonStopped, the signal fires, nothing retries by itself", async () => {
  const w = await world();
  try {
    const stops = [];
    const agent = w.make({ onStopped: (e) => stops.push(e) });
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    const read = await agent.callTool("read_scope", { scope: "daily" });
    assert.equal(agent.stopped.aborted, false);

    // the person revokes
    w.issuer.revoke(read.receipt.consent_id);

    await assert.rejects(agent.callTool("read_scope", { scope: "daily" }), (e) => {
      assert.ok(e instanceof PersonStopped);
      assert.equal(e.consentId, read.receipt.consent_id);
      assert.equal(e.scope, "daily");
      return true;
    });
    assert.equal(agent.stopped.aborted, true);
    assert.ok(agent.stopped.reason instanceof PersonStopped);
    assert.equal(stops.length, 1);
    assert.equal((await agent.showMyGrant()).state, "stopped");

    // no silent retry: no new authorization was started, and the next call makes no request at all
    const authorizeBefore = w.issuer.authorizeCount();
    const logBefore = w.issuer.log.length;
    const hitsBefore = w.resource.hits.length;
    await assert.rejects(agent.callTool("read_scope", { scope: "daily" }), PersonStopped);
    await assert.rejects(agent.connect(), PersonStopped);
    assert.equal(w.issuer.authorizeCount(), authorizeBefore);
    assert.equal(w.issuer.log.length, logBefore, "a stopped agent asks the issuer for nothing");
    assert.equal(w.resource.hits.length, hitsBefore, "and the resource for nothing");
    assert.equal(stops.length, 1, "the callback fires once");

    // asking again is a call you make on purpose, and it starts a new request to the person
    const ask = await agent.connect({ askAgain: true });
    assert.equal(ask.ok, false);
    assert.equal(ask.ask.scope, "daily");
    assert.equal(agent.stopped.aborted, false, "a fresh signal");
    await agent.finishAuth(w.issuer.yes(ask.ask.authorizeUrl));
    assert.equal((await agent.callTool("read_scope", { scope: "daily" })).ok, true);
  } finally { await w.close(); }
});

test("a stop is found by the live check too", async () => {
  const w = await world();
  try {
    const agent = w.make();
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    const { receipt } = await agent.callTool("read_scope", { scope: "daily" });
    w.issuer.revoke(receipt.consent_id);
    const grant = await agent.showMyGrant({ live: true });
    assert.equal(grant.state, "stopped");
    assert.equal(agent.stopped.aborted, true);
  } finally { await w.close(); }
});

test("a token that ran out is an ended token, not a stop: the agent asks again for the scope it held", async () => {
  const w = await world({ expiresIn: 60 });
  try {
    let clock = Date.now();
    const agent = w.make({ now: () => clock });
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    assert.equal((await agent.callTool("read_scope", { scope: "daily" })).ok, true);
    clock += 61_000;
    assert.equal((await agent.showMyGrant()).state, "ended");
    const r = await agent.callTool("read_scope", { scope: "daily" });
    assert.equal(r.ok, false);
    assert.equal(r.ask.reason, "expired");
    assert.equal(r.ask.scope, "daily");
    assert.equal(agent.stopped.aborted, false);
  } finally { await w.close(); }
});

test("a token the resource refuses on its first use is not read as a stop", async () => {
  const w = await world({}, { grantees: ["sbx_somebody_else"] });
  try {
    const agent = w.make();
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    await assert.rejects(agent.listTools(), (e) => e instanceof Error && !(e instanceof PersonStopped));
    assert.equal(agent.stopped.aborted, false);
  } finally { await w.close(); }
  const w2 = await world({ aud: true }, {});
  try {
    // a token for another audience: the mock issuer binds what the library asked for, so ask for the wrong one
    const agent = w2.make();
    const first = await agent.connect();
    const cb = w2.issuer.yes(first.ask.authorizeUrl);
    for (const t of w2.issuer.tokens.values()) t.aud = "https://another.example.test/mcp";
    await agent.finishAuth(cb);
    for (const t of w2.issuer.tokens.values()) t.aud = "https://another.example.test/mcp";
    await assert.rejects(agent.listTools(), TokenRefused);
    assert.equal(agent.stopped.aborted, false);
  } finally { await w2.close(); }
});

// -- the callback -----------------------------------------------------------

test("the person's no, a callback from the wrong issuer, a wrong state and a missing issuer are all refused", async () => {
  const w = await world();
  try {
    const agent = w.make();
    const a = await agent.connect();
    await assert.rejects(agent.finishAuth(w.issuer.no(a.ask.authorizeUrl)), (e) => e instanceof PersonDeclined && e.error === "access_denied");
    const b = await agent.connect();
    const good = new URL(w.issuer.yes(b.ask.authorizeUrl));
    const wrongIss = new URL(good); wrongIss.searchParams.set("iss", "https://elsewhere.example.test");
    await assert.rejects(agent.finishAuth(wrongIss.toString()), CallbackMismatch);
    const c = await agent.connect();
    const g2 = new URL(w.issuer.yes(c.ask.authorizeUrl));
    const wrongState = new URL(g2); wrongState.searchParams.set("state", "forged");
    await assert.rejects(agent.finishAuth(wrongState.toString()), CallbackMismatch);
    const d = await agent.connect();
    const g3 = new URL(w.issuer.yes(d.ask.authorizeUrl)); g3.searchParams.delete("iss");
    await assert.rejects(agent.finishAuth(g3.toString()), CallbackMismatch);
    // and with nothing waiting
    await assert.rejects(agent.finishAuth("http://127.0.0.1:4000/callback?code=x&state=y"), CallbackMismatch);
  } finally { await w.close(); }
});

// -- receipts -----------------------------------------------------------------

test("a receipt is read from a result as a reference and a hash, whatever else the result holds", () => {
  const r = receiptOf({ isError: false, content: [{ type: "text", text: JSON.stringify({ band: "x", consent_id: "urn:c", access_recorded: true, ledger_entry_hash: "ab" }) }] });
  assert.deepEqual(r, { consent_id: "urn:c", ledger_entry_hash: "ab", access_recorded: true });
  assert.equal(receiptOf({ isError: true, content: [] }), null);
  assert.equal(receiptOf({ content: [{ type: "text", text: "not json" }] }), null);
  assert.equal(receiptOf({ structuredContent: { band: "x" } }), null);
  const store = new MemoryReceiptStore();
  store.add({ consent_id: "urn:c" });
  assert.deepEqual(store.list(), [{ consent_id: "urn:c" }]);
});

test("receipts can be kept in a file, and the file holds references and hashes only", async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pma-"));
  const w = await world();
  try {
    const store = fileReceiptStore(join(dir, "receipts.jsonl"));
    assert.deepEqual(store.list(), []);
    const agent = w.make({ store });
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    await agent.callTool("read_scope", { scope: "daily" });
    await agent.callTool("read_scope", { scope: "daily" });
    assert.equal(store.list().length, 2);
    const raw = readFileSync(join(dir, "receipts.jsonl"), "utf8");
    assert.ok(!raw.includes("drifting") && !raw.includes("lc_") && !raw.includes(w.agentClient.client_secret));
  } finally { rmSync(dir, { recursive: true, force: true }); await w.close(); }
});

test("connect() on an agent that already holds a token the resource accepts is ready at once", async () => {
  const w = await world();
  try {
    const agent = w.make();
    const first = await agent.connect();
    await agent.finishAuth(w.issuer.yes(first.ask.authorizeUrl));
    assert.deepEqual(await agent.connect(), { ok: true });
    assert.deepEqual(await agent.connect(), { ok: true });
    assert.equal(w.issuer.authorizeCount(), 1);
  } finally { await w.close(); }
});

test("configuration is checked up front", () => {
  const base = { resource: "https://api.example.test/mcp", issuer: "https://as.example.test", clientId: "a", clientSecret: "b", redirectUrl: "http://127.0.0.1:4000/callback" };
  assert.doesNotThrow(() => createAgent(base));
  assert.throws(() => createAgent({ ...base, clientSecret: undefined }), /no dynamic registration/);
  assert.throws(() => createAgent({ ...base, redirectUrl: undefined }), /redirectUrl/);
  assert.throws(() => createAgent({ ...base, issuer: "http://as.example.test" }), /https/);
  assert.throws(() => createAgent({ ...base, scope: "two words" }), /scope/);
  assert.throws(() => createAgent({ ...base, introspectionEndpoint: "https://elsewhere.example.test/i" }), /issuer's origin/);
});
