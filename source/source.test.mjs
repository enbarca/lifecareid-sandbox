// The sandbox synthetic source (source.js, mounted by the Pages function in
// pages/functions/sandbox-source/): a zero-PHI reference data source and a test
// fixture. The sandbox authorization server is mocked here: what is under test
// is what the source does with each answer it can get.
//
// Run: node --test (from the kit root)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";

import { onRequest } from "../pages/functions/sandbox-source/[[path]].js";
import PERSONAS from "./personas.generated.js";
import {
  ACCESSOR,
  SCOPES,
  TOOLS,
  personaIndexFor,
  selectPersona,
} from "./source.js";

const SANDBOX = "https://sandbox.example";
const ENV = { LIFECAREID_SANDBOX_ORIGIN: SANDBOX + "/" };
// The source's own client credentials at the sandbox (lifecareid audit F12: the
// sandbox admits only an authenticated client to introspection).
const CREDENTIALED = {
  ...ENV, LIFECAREID_SANDBOX_SOURCE_CLIENT_ID: "sbx_src", LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET: "s3",
};
const OWNER = "did:web:sandbox.example:u:817612d13f3219b6";
const TOKEN = "lc_test-token";
const METADATA = "https://site.example/.well-known/oauth-protected-resource/sandbox-source/mcp";

const ACTIVE = {
  active: true,
  token_type: "access",
  resource_owner: OWNER,
  scope: "recovery",
  purpose: "agent governance pilot",
  requester: "sbx_client",
  consent_id: "urn:lifecare:consent:abc",
  expires_at: "2999-01-01T00:00:00+00:00",
  // a token from the code flow names its resource; one without is refused
  aud: "https://site.example/sandbox-source/mcp",
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Stands in for the sandbox. `introspection` and `record` are functions so a
// test can change the answer between two calls (revocation).
function sandbox({ introspection = () => ACTIVE, record = () => ({ recorded: true, entry_hash: "h1" }) } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const answer = url.endsWith("/v1/token/introspect") ? introspection(body) : record(body);
    if (answer instanceof Response) return answer;
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  return calls;
}

function get(path, { token = TOKEN, env = ENV } = {}) {
  const headers = token ? { authorization: "Bearer " + token } : {};
  return onRequest({ request: new Request("https://site.example/sandbox-source" + path, { headers }), env });
}

function mcp(message, { token = TOKEN, env = ENV } = {}) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (token) headers.authorization = "Bearer " + token;
  return onRequest({
    request: new Request("https://site.example/sandbox-source/mcp", {
      method: "POST", headers, body: typeof message === "string" ? message : JSON.stringify(message),
    }),
    env,
  });
}

const read = (scope = "recovery", owner = OWNER, options) =>
  get(`/v1/source/${scope}?owner=${encodeURIComponent(owner)}`, options);

// ---------------------------------------------------------------- REST: allow

test("an active token for the scope and owner is introspected, recorded, then served", async () => {
  const calls = sandbox();
  const res = await read();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();

  // ledger first: introspect, then the access record, and only then the data
  assert.deepEqual(calls.map((c) => c.url), [
    SANDBOX + "/v1/token/introspect",
    SANDBOX + "/v1/access/record",
  ]);
  assert.deepEqual(calls[0].body, { token: TOKEN });
  // only {subject, scope, purpose, accessor, consent_id} goes back to the
  // sandbox: no value. The consent id is the one introspection returned.
  assert.deepEqual(calls[1].body, {
    subject_did: OWNER, scope: "recovery", purpose: "agent governance pilot", accessor: ACCESSOR,
    consent_id: ACTIVE.consent_id,
  });

  assert.equal(body.fixture, true);
  assert.match(body.notice, /LifeCare\.ID® sandbox/);
  assert.equal(body.resource_owner, OWNER);
  assert.equal(body.scope, "recovery");
  assert.equal(body.access_recorded, true);
  assert.equal(body.ledger_entry_hash, "h1");
  assert.equal(body.persona.selected_by, "did-hash");
  assert.deepEqual(body.data, PERSONAS.personas[body.persona.persona_id].scopes.recovery);
});

test("every scope in the vocabulary is served under a token for that scope", async () => {
  for (const scope of Object.keys(SCOPES)) {
    sandbox({ introspection: () => ({ ...ACTIVE, scope }) });
    const res = await read(scope);
    assert.equal(res.status, 200, scope);
    const body = await res.json();
    assert.equal(typeof body.data.covered, "boolean", scope);
    assert.equal(typeof body.data.sentence, "string", scope);
  }
});

test("the descriptor is public, names the fixture, and reports whether it is configured", async () => {
  const calls = sandbox();
  const res = await get("/", { token: null });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(calls.length, 0);
  assert.equal(body.fixture, true);
  assert.equal(body.configured, true);
  assert.equal(body.client_credentials, false);
  assert.equal(body.authorization_server, SANDBOX);
  assert.deepEqual(body.persona_ids, PERSONAS.persona_ids);
  assert.equal(body.mcp.endpoint, "https://site.example/sandbox-source/mcp");
  assert.equal((await (await get("", { token: null, env: {} })).json()).configured, false);
  // Whether the source has its credentials, never the credentials themselves.
  const credentialed = await (await get("/", { token: null, env: CREDENTIALED })).text();
  assert.equal(JSON.parse(credentialed).client_credentials, true);
  assert.equal(credentialed.includes("s3"), false);
  assert.equal(credentialed.includes(btoa("sbx_src:s3")), false);
});

// --------------------------------------------------------------- REST: refuse

test("no bearer token is 401 and the sandbox is never asked", async () => {
  const calls = sandbox();
  const res = await read("recovery", OWNER, { token: null });
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /^Bearer/);
  assert.deepEqual(await res.json(), {
    detail: "present a sandbox access token as Authorization: Bearer lc_...",
    error: "missing_token",
  });
  assert.equal(calls.length, 0);
});

test("an inactive token (unknown, revoked or expired at the sandbox) is 401 and nothing is recorded", async () => {
  const calls = sandbox({ introspection: () => ({ active: false }) });
  const res = await read();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { detail: "token inactive or unknown", error: "invalid_token" });
  assert.equal(calls.length, 1);
});

test("a token the sandbox still calls active but whose expires_at has passed is 401", async () => {
  const calls = sandbox({ introspection: () => ({ ...ACTIVE, expires_at: "2020-01-01T00:00:00+00:00" }) });
  const res = await read();
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "invalid_token");
  assert.equal(calls.length, 1);
});

test("the wrong scope is 403 and nothing is recorded", async () => {
  const calls = sandbox();
  const res = await read("cgm");
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    detail: 'the token covers scope "recovery", not "cgm"',
    error: "insufficient_scope",
  });
  assert.equal(calls.length, 1);
});

test("the wrong subject is 403 and nothing is recorded", async () => {
  const calls = sandbox();
  const res = await read("recovery", "did:web:sandbox.example:u:someoneelse");
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "wrong_subject");
  assert.equal(calls.length, 1);
});

test("no owner named is 400: the subject check is never skipped", async () => {
  sandbox();
  const res = await get("/v1/source/recovery");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "owner_required");
});

test("a user (session) token is 403: only token_type access reads data", async () => {
  const calls = sandbox({
    introspection: () => ({ active: true, token_type: "user", subject_did: OWNER }),
  });
  const res = await read();
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "wrong_token_type");
  assert.equal(calls.length, 1);
});

test("a scope outside the vocabulary is 404, after the token is checked", async () => {
  const calls = sandbox();
  const res = await read("heart_rate");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "unknown_scope");
  assert.equal(calls.length, 1);
});

test("revocation takes effect on the next call: no decision is cached", async () => {
  let revoked = false;
  const calls = sandbox({ introspection: () => (revoked ? { active: false } : ACTIVE) });
  assert.equal((await read()).status, 200);
  revoked = true;
  assert.equal((await read()).status, 401);
  // two introspections for two requests, one record for the one that was served
  assert.equal(calls.filter((c) => c.url.endsWith("/introspect")).length, 2);
  assert.equal(calls.filter((c) => c.url.endsWith("/record")).length, 1);
});

test("fails closed when the sandbox cannot be asked", async () => {
  for (const introspection of [
    () => new Response("Internal Server Error", { status: 500 }),
    () => new Response("not json", { status: 200 }),
    () => new Error("network down"),
  ]) {
    sandbox({ introspection });
    const res = await read();
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "introspection_unavailable");
  }
});

test("an access that cannot be written to the ledger is not served", async () => {
  for (const record of [
    () => new Response("{}", { status: 403 }),
    () => ({ recorded: false }),
    () => new Error("network down"),
  ]) {
    sandbox({ record });
    const res = await read();
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "access_record_failed");
    assert.equal(body.data, undefined);
  }
});

test("with no sandbox origin configured the data routes are 503 and nothing is fetched", async () => {
  for (const env of [{}, { LIFECAREID_SANDBOX_ORIGIN: "http://sandbox.example" },
    { LIFECAREID_SANDBOX_ORIGIN: "https://sandbox.example/id" }]) {
    const calls = sandbox();
    const res = await read("recovery", OWNER, { env });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "source_not_configured");
    assert.equal(calls.length, 0);
  }
});

test("the introspection and the access record carry the source's client credentials", async () => {
  const calls = sandbox();
  const res = await read("recovery", OWNER, { env: CREDENTIALED });
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.url), [SANDBOX + "/v1/token/introspect", SANDBOX + "/v1/access/record"]);
  // As itself on both calls: the sandbox introspects only for an authenticated
  // client (RFC 7662 section 2.1). The caller's token stays in the body.
  assert.equal(calls[0].headers.authorization, "Basic " + btoa("sbx_src:s3"));
  assert.equal(calls[1].headers.authorization, "Basic " + btoa("sbx_src:s3"));
  assert.deepEqual(calls[0].body, { token: TOKEN });
});

test("without both credential variables the source sends no credential at all", async () => {
  for (const env of [ENV, { ...ENV, LIFECAREID_SANDBOX_SOURCE_CLIENT_ID: "sbx_src" },
    { ...ENV, LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET: "s3" }]) {
    const calls = sandbox();
    await read("recovery", OWNER, { env });
    assert.equal(calls[0].headers.authorization, undefined);
    assert.equal(calls[1].headers.authorization, undefined);
  }
});

test("a sandbox that refuses the source's own credentials: 503, nothing recorded or served", async () => {
  for (const status of [401, 403]) {
    const calls = sandbox({
      introspection: () => new Response(JSON.stringify({ detail: "no" }), { status }),
    });
    const res = await read("recovery", OWNER, { env: CREDENTIALED });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "source_not_authorized");
    assert.equal(body.data, undefined);
    assert.equal(calls.length, 1); // no access record
  }
});

test("the access record names the grant the read was made under, and omits it when introspection gave none", async () => {
  let calls = sandbox();
  await read();
  assert.equal(calls[1].body.consent_id, "urn:lifecare:consent:abc");
  // no consent id from introspection: the field is left out, never sent as null
  for (const consent_id of [undefined, null, ""]) {
    const { consent_id: _dropped, ...rest } = ACTIVE;
    calls = sandbox({ introspection: () => (consent_id === undefined ? rest : { ...rest, consent_id }) });
    const res = await read();
    assert.equal(res.status, 200);
    assert.ok(!Object.hasOwn(calls[1].body, "consent_id"));
    assert.deepEqual(Object.keys(calls[1].body).sort(), ["accessor", "purpose", "scope", "subject_did"]);
  }
});

test("only GET reads; a preflight is answered without a token", async () => {
  sandbox();
  const post = await onRequest({
    request: new Request("https://site.example/sandbox-source/v1/source/recovery", { method: "POST" }), env: ENV,
  });
  assert.equal(post.status, 405);
  const preflight = await onRequest({
    request: new Request("https://site.example/sandbox-source/mcp", { method: "OPTIONS" }), env: ENV,
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.equal((await get("/v1/nothing")).status, 404);
});

// ------------------------------------------------------------ weekly summary

test("the weekly summary needs the daily scope and defaults to the latest week", async () => {
  sandbox();
  assert.equal((await get(`/v1/weekly-summary?owner=${OWNER}`)).status, 403);

  const calls = sandbox({ introspection: () => ({ ...ACTIVE, scope: "daily" }) });
  const res = await get(`/v1/weekly-summary?owner=${OWNER}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  const persona = PERSONAS.personas[body.persona.persona_id];
  assert.deepEqual(body.data.week, persona.weeks.at(-1));
  assert.equal(body.data.headline, persona.headline);
  assert.equal(calls[1].body.scope, "daily");

  const first = await (await get(`/v1/weekly-summary?owner=${OWNER}&week=0`)).json();
  assert.equal(first.data.week.week_index, 0);
  const missing = await get(`/v1/weekly-summary?owner=${OWNER}&week=40`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "unknown_week");
});

// ----------------------------------------------------------- persona mapping

test("a DID maps to a persona by sha256, first four bytes big-endian, modulo five", async () => {
  assert.equal(PERSONAS.persona_ids.length, 5);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const did = `did:web:sandbox.example:u:${i.toString(16).padStart(16, "0")}`;
    const expected = createHash("sha256").update(did, "utf8").digest().readUInt32BE(0) % 5;
    assert.equal(await personaIndexFor(did), expected);
    assert.equal(await personaIndexFor(did), expected); // stable
    seen.add(expected);
  }
  assert.equal(seen.size, 5); // every persona is reachable
  // one pinned example, so the rule cannot drift unnoticed
  assert.equal(await personaIndexFor(OWNER),
    createHash("sha256").update(OWNER).digest().readUInt32BE(0) % 5);
});

test("a grant purpose carrying persona:<id> pins that persona; anything else falls back to the hash", async () => {
  for (const id of PERSONAS.persona_ids) {
    const picked = await selectPersona({ ...ACTIVE, purpose: `agent governance pilot persona:${id}` });
    assert.equal(picked.persona.persona_id, id);
    assert.equal(picked.selected_by, "purpose");
  }
  const hashed = PERSONAS.persona_ids[await personaIndexFor(OWNER)];
  for (const purpose of ["agent governance pilot", "persona:p9-nobody", "xpersona:p2-glp1-muscle-loser", ""]) {
    const picked = await selectPersona({ ...ACTIVE, purpose });
    assert.equal(picked.persona.persona_id, hashed, purpose);
    assert.equal(picked.selected_by, "did-hash");
  }
});

test("the persona cannot be chosen per request: only the token decides", async () => {
  sandbox();
  const plain = await (await read()).json();
  const tried = await (await get(`/v1/source/recovery?owner=${encodeURIComponent(OWNER)}&persona=p5-glucose-anomaly`)).json();
  assert.equal(tried.persona.persona_id, plain.persona.persona_id);
});

// ------------------------------------------------------------- output filter

const RAW_KEY = /(_kg|_ms|_mg|mg_dl|_pct|percent|steps|weight_delta|lean_delta|fat_delta|baseline|ratio|n_samples|sessions|calories|hrv|readings?|samples?|value)$/i;
const NUMERIC_KEYS = new Set(["score", "week_index", "weeks"]);

function walk(node, path, visit) {
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      visit(k, v, `${path}.${k}`);
      walk(v, `${path}.${k}`, visit);
    }
  }
}

test("the output filter: no sentence carries a digit, and no field carries a raw value", () => {
  let sentences = 0;
  walk(PERSONAS.personas, "personas", (key, value, path) => {
    assert.ok(!RAW_KEY.test(key), `${path}: a raw-value field`);
    if (key === "sentence" || key === "headline") {
      sentences += 1;
      assert.equal(typeof value, "string", path);
      assert.ok(!/\d/.test(value), `${path}: a digit in ${JSON.stringify(value)}`);
      assert.ok(!/[!—]/.test(value), `${path}: brand rules`);
    }
    if (typeof value === "number") {
      assert.ok(NUMERIC_KEYS.has(key), `${path}: a number outside score and week fields`);
      if (key === "score") assert.ok(value >= 0 && value <= 100, path);
    }
  });
  assert.ok(sentences > 50);
});

test("what is served is exactly the generated data: the handlers add no value of their own", async () => {
  for (const id of PERSONAS.persona_ids) {
    for (const scope of Object.keys(SCOPES)) {
      sandbox({ introspection: () => ({ ...ACTIVE, scope, purpose: `pilot persona:${id}` }) });
      const body = await (await read(scope)).json();
      assert.deepEqual(body.data, PERSONAS.personas[id].scopes[scope]);
      assert.deepEqual(Object.keys(body).sort(), [
        "access_recorded", "as_of", "consent_id", "data", "fixture", "ledger_entry_hash", "notice",
        "persona", "purpose", "requester", "resource_owner", "scope",
      ]);
    }
  }
});

// ------------------------------------------------------------------- MCP face

const call = (name, args = {}, id = 7) =>
  ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("MCP: initialize, tools/list and ping answer under an active token, labelled a test fixture", async () => {
  sandbox();
  const init = await mcp({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
  });
  assert.equal(init.status, 200);
  assert.match(init.headers.get("content-type"), /^application\/json/);
  const result = (await init.json()).result;
  assert.equal(result.protocolVersion, "2025-06-18");
  assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
  assert.match(result.serverInfo.title, /LifeCare\.ID® .*test fixture/);
  assert.match(result.instructions, /not the member MCP surface/);

  const unknown = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal((await unknown.json()).result.protocolVersion, "2025-06-18");

  const list = (await (await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()).result.tools;
  assert.deepEqual(list.map((t) => t.name), ["list_scopes", "read_scope", "get_weekly_summary"]);
  for (const tool of list) assert.match(tool.description, /^TEST FIXTURE/);
  assert.deepEqual(list, TOOLS);

  assert.deepEqual((await (await mcp({ jsonrpc: "2.0", id: 3, method: "ping" })).json()).result, { resultType: "complete" });
  const notified = await mcp({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notified.status, 202);
  assert.equal(await notified.text(), "");
});

test("MCP: read_scope returns what REST returns, through the same checks and the same record", async () => {
  const calls = sandbox();
  const res = await mcp(call("read_scope", { scope: "recovery", owner: OWNER }));
  const result = (await res.json()).result;
  assert.equal(result.isError, false);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual(calls.map((c) => c.url), [
    SANDBOX + "/v1/token/introspect", SANDBOX + "/v1/access/record",
  ]);
  sandbox();
  assert.deepEqual(result.structuredContent, await (await read()).json());
});

test("MCP: list_scopes names the owner and the one readable scope, and records nothing", async () => {
  const calls = sandbox();
  const result = (await (await mcp(call("list_scopes"))).json()).result;
  assert.equal(result.isError, false);
  const body = result.structuredContent;
  assert.equal(body.token.resource_owner, OWNER);
  assert.deepEqual(body.scopes.filter((s) => s.readable_with_this_token).map((s) => s.scope), ["recovery"]);
  assert.deepEqual(body.scopes.map((s) => s.scope), Object.keys(SCOPES));
  assert.equal(calls.length, 1);
});

test("MCP: get_weekly_summary needs the daily scope", async () => {
  sandbox({ introspection: () => ({ ...ACTIVE, scope: "daily" }) });
  const ok = (await (await mcp(call("get_weekly_summary", { owner: OWNER, week: 1 }))).json()).result;
  assert.equal(ok.isError, false);
  assert.equal(ok.structuredContent.data.week.week_index, 1);
  const calls = sandbox();
  // A token for another scope: a single call is refused at the transport (403
  // with the step-up challenge naming daily), and nothing is recorded.
  const refused = await mcp(call("get_weekly_summary", { owner: OWNER }));
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get("www-authenticate"),
    'Bearer error="insufficient_scope", scope="daily", resource_metadata="' + METADATA + '"');
  assert.equal((await refused.json()).error, "insufficient_scope");
  assert.equal(calls.filter((c) => c.url.endsWith("/record")).length, 0);
});

test("MCP: a single wrong-scope tools/call is a transport 403 with the step-up challenge, and records nothing", async () => {
  const calls = sandbox();
  const res = await mcp(call("read_scope", { scope: "cgm", owner: OWNER }));
  assert.equal(res.status, 403);
  // The same { detail, error } body the other transport refusals carry (no
  // JSON-RPC envelope, no status field), and the three challenge attributes.
  assert.deepEqual(await res.json(), {
    detail: 'the token covers scope "recovery", not "cgm"', error: "insufficient_scope",
  });
  assert.equal(res.headers.get("www-authenticate"),
    'Bearer error="insufficient_scope", scope="cgm", resource_metadata="' + METADATA + '"');
  assert.match(res.headers.get("content-type"), /^application\/json/);
  // introspected once; nothing written to the owner's ledger
  assert.deepEqual(calls.map((c) => c.url), [SANDBOX + "/v1/token/introspect"]);
});

test("MCP: a batch keeps the tool error for a wrong-scope element, and sends no header", async () => {
  const calls = sandbox();
  const res = await mcp([
    call("read_scope", { scope: "cgm", owner: OWNER }, 1),
    call("read_scope", { scope: "recovery", owner: OWNER }, 2),
  ]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("www-authenticate"), null);
  const answers = await res.json();
  const refused = answers.find((a) => a.id === 1).result;
  assert.equal(refused.isError, true);
  assert.deepEqual(refused.structuredContent, {
    detail: 'the token covers scope "recovery", not "cgm"', error: "insufficient_scope", status: 403,
  });
  assert.equal(answers.find((a) => a.id === 2).result.isError, false);
  // only the served element was recorded
  assert.equal(calls.filter((c) => c.url.endsWith("/record")).length, 1);

  // a batch of one is still a batch
  const one = await mcp([call("read_scope", { scope: "cgm", owner: OWNER })]);
  assert.equal(one.status, 200);
  assert.equal(one.headers.get("www-authenticate"), null);
  assert.equal((await one.json())[0].result.structuredContent.error, "insufficient_scope");
});

test("MCP: wrong subject, unknown scope and missing owner stay tool errors with the REST shapes, and record nothing", async () => {
  const calls = sandbox();
  const subject = await mcp(call("read_scope", { scope: "recovery", owner: "did:web:x:u:other" }));
  assert.equal(subject.status, 200);
  assert.equal(subject.headers.get("www-authenticate"), null);
  const subjectResult = (await subject.json()).result;
  assert.equal(subjectResult.isError, true);
  assert.equal(subjectResult.structuredContent.error, "wrong_subject");
  assert.equal(subjectResult.structuredContent.status, 403);

  const unknown = await mcp(call("read_scope", { scope: "told_to_guardian", owner: OWNER }));
  assert.equal(unknown.status, 200);
  assert.equal(unknown.headers.get("www-authenticate"), null);
  const unknownResult = (await unknown.json()).result;
  assert.equal(unknownResult.isError, true);
  assert.equal(unknownResult.structuredContent.error, "unknown_scope");
  assert.equal(unknownResult.structuredContent.status, 404);

  const missing = await mcp(call("read_scope", { scope: "recovery" }));
  assert.equal(missing.status, 200);
  const missingResult = (await missing.json()).result;
  assert.equal(missingResult.structuredContent.error, "owner_required");
  assert.equal(missingResult.structuredContent.status, 400);
  assert.equal(calls.filter((c) => c.url.endsWith("/record")).length, 0);
});

test("MCP: the transport itself is refused without an active access token, on every method", async () => {
  sandbox();
  const none = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { token: null });
  assert.equal(none.status, 401);
  assert.match(none.headers.get("www-authenticate"), /^Bearer/);

  let revoked = false;
  sandbox({ introspection: () => (revoked ? { active: false } : ACTIVE) });
  assert.equal((await mcp(call("read_scope", { scope: "recovery", owner: OWNER }))).status, 200);
  revoked = true;
  for (const message of [
    call("read_scope", { scope: "recovery", owner: OWNER }),
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "initialize", params: {} },
  ]) {
    const res = await mcp(message);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "invalid_token");
  }

  sandbox({ introspection: () => ({ active: true, token_type: "user", subject_did: OWNER }) });
  assert.equal((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" })).status, 403);
});

test("MCP: protocol errors are JSON-RPC errors", async () => {
  sandbox();
  const parse = await mcp("{not json");
  assert.equal(parse.status, 400);
  assert.equal((await parse.json()).error.code, -32700);
  assert.equal((await (await mcp({ jsonrpc: "2.0", id: 1, method: "completion/complete" })).json()).error.code, -32601);
  assert.equal((await (await mcp(call("delete_everything"))).json()).error.code, -32602);
  assert.equal((await (await mcp({ id: 1, method: "ping" })).json()).error.code, -32600);
  const got = await onRequest({
    request: new Request("https://site.example/sandbox-source/mcp", { headers: { authorization: "Bearer " + TOKEN } }),
    env: ENV,
  });
  assert.equal(got.status, 405);
});

// ---------------------------------------------------------- MCP: optional lists

test("the optional capability lists answer empty, never method-not-found (gateways ask for them)", async () => {
  sandbox();
  for (const [method, key] of [
    ["resources/list", "resources"],
    ["resources/templates/list", "resourceTemplates"],
    ["prompts/list", "prompts"],
  ]) {
    const res = await mcp({ jsonrpc: "2.0", id: 11, method });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.error, undefined, method);
    assert.deepEqual(body.result[key], []);
  }
  const level = await mcp({ jsonrpc: "2.0", id: 12, method: "logging/setLevel", params: { level: "info" } });
  assert.deepEqual((await level.json()).result, { resultType: "complete" });
  const unknown = await mcp({ jsonrpc: "2.0", id: 13, method: "completion/complete" });
  assert.equal((await unknown.json()).error.code, -32601);
});

// ------------------------------------------------------------ MCP: 2026-07-28

test("server/discover answers the modern era: versions, capabilities, serverInfo in _meta", async () => {
  sandbox();
  const res = await mcp({
    jsonrpc: "2.0", id: "discover-1", method: "server/discover",
    params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                       "io.modelcontextprotocol/clientInfo": { name: "gateway", version: "4" },
                       "io.modelcontextprotocol/clientCapabilities": {} } },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.error, undefined);
  assert.equal(body.result.resultType, "complete");
  assert.deepEqual(body.result.supportedVersions, ["2026-07-28"]);
  assert.equal(body.result.cacheScope, "public");
  assert.equal(typeof body.result.ttlMs, "number");
  assert.deepEqual(body.result.capabilities, { tools: { listChanged: false } });
  assert.equal(body.result._meta["io.modelcontextprotocol/serverInfo"].name, "lifecare-sandbox-source");
  assert.match(body.result.instructions, /list_scopes first/);
});

test("a modern-stamped tools/call (per-request _meta, no initialize) is served like a legacy one", async () => {
  const calls = sandbox();
  const res = await mcp({
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "read_scope", arguments: { scope: "recovery", owner: OWNER },
              _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                       "io.modelcontextprotocol/clientInfo": { name: "gateway", version: "4" },
                       "io.modelcontextprotocol/clientCapabilities": {} } },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.error, undefined, JSON.stringify(body));
  assert.notEqual(body.result.isError, true);
  assert.ok(calls.some((c) => c.url.endsWith("/v1/token/introspect")));
});

test("initialize still negotiates the legacy era and answers 2026-07-28 when asked", async () => {
  sandbox();
  const legacy = await (await mcp({ jsonrpc: "2.0", id: 3, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } })).json();
  assert.equal(legacy.result.protocolVersion, "2025-06-18");
  const modern = await (await mcp({ jsonrpc: "2.0", id: 4, method: "initialize",
    params: { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "x", version: "1" } } })).json();
  assert.equal(modern.result.protocolVersion, "2026-07-28");
});

test("every result carries resultType, and the list results carry ttlMs and cacheScope (2026-07-28)", async () => {
  sandbox();
  const list = await (await mcp({ jsonrpc: "2.0", id: 20, method: "tools/list" })).json();
  assert.equal(list.result.resultType, "complete");
  assert.equal(list.result.cacheScope, "public");
  assert.equal(typeof list.result.ttlMs, "number");
  for (const method of ["resources/list", "resources/templates/list", "prompts/list"]) {
    const r = await (await mcp({ jsonrpc: "2.0", id: 21, method })).json();
    assert.equal(r.result.resultType, "complete", method);
    assert.equal(r.result.cacheScope, "public", method);
  }
  const called = await (await mcp(call("read_scope", { scope: "recovery", owner: OWNER }))).json();
  assert.equal(called.result.resultType, "complete");
  const ping = await (await mcp({ jsonrpc: "2.0", id: 23, method: "ping" })).json();
  assert.equal(ping.result.resultType, "complete");
});
