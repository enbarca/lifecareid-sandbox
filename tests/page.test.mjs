// The page backend, against a fake sandbox and a fake source on loopback: no
// network. Walks the endpoints the page calls: config, yes, exchange, read,
// revoke, the refused read, and the cleanup. Also checks that no secret reaches
// a response or a log line, and the brand rules over the page's own files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { test } from "node:test";

import { createPage } from "../examples/person-managed-auth/page/server.mjs";

const DEV = "devaccess-secret-value-1234567890";
const CLIENT_SECRET = "client-secret-value-abcdefghij";
const SESSION = "lcs_person-session-value-abcdefghij";
const TOKEN = "lc_access-token-value-abcdefghijklmnop";
const CODE = "code-value-abcdefghijklmnop";
const DID = "did:web:example.test:person";
const CONSENT = "urn:lifecare:consent:0123456789abcdef";

function fakeSandbox() {
  const seen = { clients: [], deleted: [], tokenForm: null, sourceHost: null, revoked: false, challenge: null };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const json = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
    const route = `${req.method} ${decodeURIComponent(url.pathname)}`;
    if (route === "POST /v1/sandbox/clients") {
      assert.equal(req.headers.authorization, "Bearer " + DEV);
      seen.clients.push(JSON.parse(raw));
      return json(200, { client_id: "sbx_fakeclient", client_secret: CLIENT_SECRET });
    }
    if (route === "POST /v1/sandbox/test-identity") return json(200, { did: DID, session_token: SESSION });
    if (route === "GET /.well-known/oauth-authorization-server") return json(200, { token_endpoint: seen.origin + "/token", authorization_endpoint: seen.origin + "/authorize" });
    if (route === "GET /authorize") {
      assert.equal(req.headers.cookie, "__Host-lc_id_session=" + SESSION);
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<h1>Allow access?</h1><p>Who asks</p><form method="post" action="/data-consent/decide">` +
        `<input type="hidden" name="state" value="${url.searchParams.get("state")}"><input type="hidden" name="redirect_uri" value="${url.searchParams.get("redirect_uri")}"></form>`);
    }
    if (route === "POST /data-consent/decide") {
      const f = new URLSearchParams(raw);
      assert.equal(f.get("decision"), "approve");
      res.writeHead(303, { location: `${f.get("redirect_uri")}?code=${CODE}&state=${f.get("state")}&iss=${seen.origin}` });
      return res.end();
    }
    if (route === "POST /token") {
      const f = new URLSearchParams(raw);
      seen.tokenForm = Object.fromEntries(f);
      const challenge = createHash("sha256").update(f.get("code_verifier")).digest("base64url");
      if (f.get("code") !== CODE || f.get("client_secret") !== CLIENT_SECRET || !challenge) return json(401, { error: "invalid_grant" });
      return json(200, { access_token: TOKEN, token_type: "Bearer", expires_in: 3600, scope: "daily" });
    }
    if (route === `GET /sandbox-source/v1/source/daily`) {
      seen.sourceHost = req.headers.host;
      if (req.headers.authorization !== "Bearer " + TOKEN || seen.revoked) {
        return json(401, { error: "invalid_token", detail: "token refused" }, { "www-authenticate": 'Bearer error="invalid_token", scope="daily"' });
      }
      return json(200, {
        consent_id: CONSENT, ledger_entry_hash: "abcdef0123456789abcdef", access_recorded: true,
        persona: { display_name: "Synthetic persona" }, data: { sleep_hours: 7.4 },
      });
    }
    if (route === `GET /v1/consent/ledger/${DID}`) return json(200, { entries: [{ event_type: "data_access", description: "read daily by the page" }] });
    if (route === "GET /v1/panel/summary") return json(200, { grants: [{ consent_id: CONSENT, grantee: { id: "sbx_fakeclient" } }] });
    if (route === "POST /v1/panel/revoke") { seen.revoked = true; return json(200, { tokens_invalidated: 1 }); }
    if (req.method === "DELETE" && url.pathname === "/v1/sandbox/clients/sbx_fakeclient") { seen.deleted.push(req.headers.authorization); return json(200, {}); }
    return json(404, { error: "not_found" });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    seen.origin = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, seen });
  }));
}

async function api(base, method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method, headers: { ...(method === "POST" ? { "content-type": "application/json", origin: base } : {}), ...headers },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("the page backend walks yes, exchange, read, revoke and the refused read", async () => {
  const { server, seen } = await fakeSandbox();
  const logs = [];
  const page = createPage({
    sandbox: seen.origin, devaccess: DEV, source: seen.origin + "/sandbox-source", port: 0, log: (l) => logs.push(l),
  });
  const base = await page.start();
  try {
    const cfg = await api(base, "GET", "/api/config");
    assert.equal(cfg.body.person_did, DID);
    assert.equal(cfg.body.client_id, "sbx_fakeclient");
    assert.equal(cfg.body.redirect_uri, base + "/callback");
    assert.equal(seen.clients[0].redirect_uris[0], base + "/callback");
    assert.deepEqual(seen.clients[0].resources, [seen.origin + "/sandbox-source/mcp"], "a source of your own is registered as a resource");

    // the yes: the backend posts it with the person's session, at the sandbox only
    const authorize = new URL(seen.origin + "/authorize");
    authorize.searchParams.set("client_id", "sbx_fakeclient");
    authorize.searchParams.set("state", "st123");
    authorize.searchParams.set("redirect_uri", cfg.body.redirect_uri);
    const yes = await api(base, "POST", "/api/yes", { authorize_url: authorize.href });
    assert.equal(yes.status, 200);
    assert.match(yes.body.callback, new RegExp(`^${base}/callback\\?code=`));
    assert.match(yes.body.question, /Allow access\?/);
    const elsewhere = await api(base, "POST", "/api/yes", { authorize_url: "https://example.com/authorize?client_id=sbx_fakeclient" });
    assert.equal(elsewhere.status, 400, "the yes is not given anywhere but the sandbox");

    // a read before any token is refused by the backend, not sent
    assert.equal((await api(base, "POST", "/api/read")).status, 409);

    // the exchange: the secret goes to the sandbox, the page gets a cut token
    const ex = await api(base, "POST", "/api/exchange", { code: CODE, code_verifier: "verifier-value-abcdefghijklmnopqrstuvwxyz" });
    assert.equal(ex.body.status, 200);
    assert.equal(ex.body.token, TOKEN.slice(0, 10) + "…");
    assert.equal(seen.tokenForm.client_secret, CLIENT_SECRET);
    assert.equal(seen.tokenForm.resource, seen.origin + "/sandbox-source/mcp");

    // the read: data and the receipt, cut
    const read = await api(base, "POST", "/api/read");
    assert.equal(read.body.status, 200);
    assert.deepEqual(read.body.data, { sleep_hours: 7.4 });
    assert.equal(read.body.receipt.consent_id, "0123456789…");
    assert.equal(read.body.receipt.ledger_entry_hash, "abcdef0123…");
    assert.equal(read.body.receipt.access_recorded, true);
    assert.equal(read.body.access_record, "read daily by the page");

    // the revoke and the refused next read
    const revoke = await api(base, "POST", "/api/revoke");
    assert.equal(revoke.body.revoked.length, 1);
    assert.equal(revoke.body.revoked[0].tokens_invalidated, 1);
    const after = await api(base, "POST", "/api/read");
    assert.equal(after.body.status, 401);
    assert.match(after.body.www_authenticate, /invalid_token/);

    // a sandbox-origin URL for another client, or at another path, is refused
    const other = new URL(authorize.href);
    other.searchParams.set("client_id", "sbx_someone_else");
    assert.equal((await api(base, "POST", "/api/yes", { authorize_url: other.href })).status, 400);
    const wrongPath = new URL(authorize.href);
    wrongPath.pathname = "/v1/panel/revoke";
    assert.equal((await api(base, "POST", "/api/yes", { authorize_url: wrongPath.href })).status, 400, "pinned to the authorization endpoint path");

    // a POST with no Origin header is refused
    const noOrigin = await fetch(base + "/api/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(noOrigin.status, 403);

    // only this page may drive the backend
    assert.equal((await api(base, "POST", "/api/read", {}, { origin: "https://evil.example" })).status, 403);
    const form = await fetch(base + "/api/revoke", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
    assert.equal(form.status, 415);

    // the page and its scripts are served
    for (const path of ["/", "/page.js", "/callback", "/callback.js"]) assert.equal((await fetch(base + path)).status, 200, path);

    // no secret in any response seen above or in any log line
    const everything = JSON.stringify([cfg.body, yes.body, ex.body, read.body, revoke.body, after.body]) + logs.join("\n");
    for (const secret of [DEV, CLIENT_SECRET, SESSION, TOKEN]) assert.ok(!everything.includes(secret), "a secret reached a response or a log");
  } finally {
    await page.stop();
    server.close();
  }
  assert.equal(seen.deleted.length, 1, "the client is deleted at stop");
  assert.match(seen.deleted[0], /^Basic /);
});

test("a source not at the browser's address is reached with the browser's host", async () => {
  const { server, seen } = await fakeSandbox();
  const page = createPage({
    sandbox: seen.origin, devaccess: DEV, source: "http://localhost:8799/sandbox-source", sourceFetch: seen.origin + "/sandbox-source", port: 0, log: () => {},
  });
  const base = await page.start();
  try {
    await api(base, "POST", "/api/exchange", { code: CODE, code_verifier: "v".repeat(43) });
    await api(base, "POST", "/api/read");
    assert.equal(seen.sourceHost, "localhost:8799");
  } finally {
    await page.stop();
    server.close();
  }
});

test("without a developer access token the backend does not start", async () => {
  const { server, seen } = await fakeSandbox();
  const page = createPage({ sandbox: seen.origin, devaccess: "", port: 0, log: () => {} });
  await assert.rejects(page.start(), /LIFECAREID_DEVACCESS_TOKEN is not set/);
  server.close();
});

// ---- the brand rules over the page's own files --------------------------------
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const FILES = ["index.html", "callback.html", "page.js", "callback.js", "server.mjs"];

for (const f of FILES) {
  test(`page/${f} keeps the brand rules`, () => {
    const text = readFileSync(new URL(`../examples/person-managed-auth/page/${f}`, import.meta.url), "utf8");
    assert.ok(!/[—–]/.test(text), "an em or en dash");
    assert.ok(!EMOJI.test(text), "an emoji");
    for (const m of text.matchAll(/LifeCare\.ID(?!®)/g)) assert.fail(`LifeCare.ID without the mark near ${JSON.stringify(text.slice(m.index - 20, m.index + 15))}`);
    // visible text and string literals carry no exclamation point
    const visible = f.endsWith(".html")
      ? text.replace(/<!doctype[^>]*>/i, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")
      : [...text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]).join("\n");
    assert.ok(!visible.includes("!"), "an exclamation point in text or a string");
  });
}
