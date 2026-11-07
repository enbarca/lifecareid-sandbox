#!/usr/bin/env node
// The browser page for person-managed authorization: a small backend and a
// static page, run from one command.
//
//   LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/page/server.mjs
//   then open http://127.0.0.1:4000
//
// The page walks discovery, the challenge, the person's yes, the code exchange
// and a read of the synthetic source, with the LifeCare.ID® sandbox as the
// authorization server. Sandbox clients registered the classic way are
// confidential, so the client secret and every token stay in this process: the
// page never sees them. It sees the code it received, a token cut to ten
// characters, and the receipt.
//
// Everything here is sandbox. This process registers one client and mints one
// synthetic person at start, and deletes the client when it stops. The
// developer access token goes only to the sandbox origin and is never logged.
//
// Environment:
//   LIFECAREID_DEVACCESS_TOKEN  required; https://app.lifecare.id/devaccess
//   LIFECAREID_SANDBOX_ORIGIN   the sandbox (default https://sandbox.lifecare.id)
//   SOURCE                      the synthetic source the browser calls (default
//                               https://lifecare.id/sandbox-source; a source run
//                               by compose is http://localhost:8799/sandbox-source)
//   SOURCE_FETCH                where this process reaches the same source when
//                               the browser's address does not work from here
//                               (default: SOURCE)
//   SCOPE                       the scope to ask for (default daily)
//   PORT, HOST                  default 4000 and 127.0.0.1
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

import { baseUrl, cut } from "../../../lib/person-managed-auth/src/shared.js";

const HERE = new URL("./", import.meta.url);
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/page.js": ["page.js", "text/javascript; charset=utf-8"],
  "/callback": ["callback.html", "text/html; charset=utf-8"],
  "/callback.js": ["callback.js", "text/javascript; charset=utf-8"],
};
const HOSTED_SOURCE_ORIGIN = "https://lifecare.id";

// A GET with the Host header chosen by the caller, shaped like the parts of a
// fetch Response this file reads.
function getWithHost(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          headers: { get: (name) => res.headers[name.toLowerCase()] ?? null },
          json: async () => JSON.parse(text),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const tail = (id) => (typeof id === "string" ? cut(id.split(":").at(-1)) : id);

// The page backend as a value, so a test can start it against a fake sandbox.
//   opts.fetch is the network (default: global fetch); opts.log receives one
//   line per request (default: console.log).
export function createPage(opts = {}) {
  const sandbox = baseUrl(opts.sandbox || "https://sandbox.lifecare.id", "sandbox");
  const devaccess = opts.devaccess || "";
  const source = baseUrl(opts.source || HOSTED_SOURCE_ORIGIN + "/sandbox-source", "source");
  const sourceFetch = baseUrl(opts.sourceFetch || source, "sourceFetch");
  const scope = opts.scope || "daily";
  const net = opts.fetch || fetch;
  const log = opts.log || ((line) => console.log(line));
  const host = opts.host || "127.0.0.1";
  const wantedPort = opts.port ?? 4000;

  const resource = source + "/mcp";
  // The hosted source's address is on the sandbox's own list of resources; any
  // other address has to be registered on the client (sandbox 0.27.0 and later).
  const registerResource = new URL(source).origin !== HOSTED_SOURCE_ORIGIN;

  // Held in this process only.
  const held = { client: null, person: null, token: null, tokenEndpoint: sandbox + "/token", authorizeEndpoint: sandbox + "/authorize", origin: null, redirect: null };
  let server;

  async function sandboxCall(method, path, { bearer, basic, cookie, body, form } = {}) {
    const headers = { accept: "application/json" };
    if (bearer) headers.authorization = "Bearer " + bearer;
    if (basic) headers.authorization = "Basic " + Buffer.from(basic).toString("base64");
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    if (form) { headers["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form); }
    const res = await net(sandbox + path, { method, headers, body: payload, redirect: "manual" });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  // ---- start and stop ------------------------------------------------------

  async function register() {
    if (!devaccess) throw new Error("LIFECAREID_DEVACCESS_TOKEN is not set (get one at https://app.lifecare.id/devaccess)");
    const body = { name: "Person-managed authorization page", redirect_uris: [held.redirect] };
    if (registerResource) body.resources = [resource];
    const c = await sandboxCall("POST", "/v1/sandbox/clients", { bearer: devaccess, body });
    if (c.status !== 200) throw new Error(`the sandbox refused the client registration (${c.status})`);
    held.client = { id: c.json.client_id, secret: c.json.client_secret };
    const p = await sandboxCall("POST", "/v1/sandbox/test-identity", { bearer: devaccess, body: {} });
    if (p.status !== 200) throw new Error(`the sandbox did not mint a synthetic person (${p.status})`);
    held.person = { did: p.json.did, session: p.json.session_token };
    const meta = await sandboxCall("GET", "/.well-known/oauth-authorization-server").catch(() => null);
    const te = meta?.json?.token_endpoint;
    if (typeof te === "string" && new URL(te).origin === new URL(sandbox).origin) held.tokenEndpoint = te;
    const ae = meta?.json?.authorization_endpoint;
    if (typeof ae === "string" && new URL(ae).origin === new URL(sandbox).origin) held.authorizeEndpoint = ae;
  }

  async function cleanup() {
    if (!held.client) return;
    const c = held.client;
    held.client = null;
    try {
      const r = await sandboxCall("DELETE", `/v1/sandbox/clients/${encodeURIComponent(c.id)}`, {
        basic: `${c.id}:${c.secret}`, cookie: devaccess ? `lc_dev=${devaccess}` : undefined,
      });
      log(`deleted the sandbox client ${c.id}: ${r.status}`);
    } catch (_) {
      log(`could not delete the sandbox client ${c.id}; delete it yourself (see compose/README.md)`);
    }
  }

  // ---- the person's yes (the one stand-in) -----------------------------------
  // A real person taps a passkey on the LifeCare.ID® origin. The sandbox lets a
  // synthetic identity's session cookie stand in for the tap, so this process
  // fetches the grant page as the person's browser would, reads its terms back
  // and posts the form with decision=approve. It will do this only for a URL on
  // the sandbox's own origin.
  async function theYes(authorizeUrl) {
    let u;
    try { u = new URL(authorizeUrl); } catch (_) { throw new Refusal(400, "authorize_url is not a URL"); }
    if (u.origin !== new URL(sandbox).origin) throw new Refusal(400, "the yes is given only at the sandbox origin");
    if (u.pathname !== new URL(held.authorizeEndpoint).pathname) throw new Refusal(400, "the yes is given only at the issuer's authorization endpoint");
    if (u.searchParams.get("client_id") !== held.client.id) throw new Refusal(400, "the authorize URL is not for this page's client");
    const cookie = `__Host-lc_id_session=${held.person.session}`;
    const page = await net(u, { headers: { cookie }, redirect: "manual" });
    const html = await page.text();
    const strip = (h) => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&reg;/g, "®").replace(/\s+/g, " ").trim();
    const action = html.match(/<form method="post" action="([^"]+)"/)?.[1];
    if (page.status !== 200 || !action) {
      const why = new URL(page.headers.get("location") || "http://x/", sandbox).searchParams.get("error");
      throw new Refusal(502, `the grant page did not render (${page.status}${why ? `, the issuer answered ${why}` : ""})`);
    }
    const heading = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
    const all = strip(html);
    const terms = all.includes("Who asks") ? all.slice(all.indexOf("Who asks")) : all;
    const form = new URLSearchParams();
    for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) {
      form.set(m[1], m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
    }
    form.set("decision", "approve");
    const decided = await net(new URL(action, sandbox), {
      method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: form, redirect: "manual",
    });
    const location = decided.headers.get("location");
    if (decided.status !== 303 || !location) throw new Refusal(502, `the yes was not accepted (${decided.status})`);
    return { callback: location, question: `${heading} | ${terms}`.slice(0, 600) };
  }

  // ---- the endpoints ---------------------------------------------------------

  const api = {
    "GET /api/config": async () => ({
      sandbox, source, resource, scope,
      client_id: held.client.id,
      redirect_uri: held.redirect,
      person_did: held.person.did,
      resource_registered_on_client: registerResource,
    }),

    // Step 3: the person's yes, given at the sandbox with the synthetic session.
    "POST /api/yes": async ({ authorize_url }) => theYes(authorize_url),

    // Step 4: the code becomes a token, with the client secret, here.
    "POST /api/exchange": async ({ code, code_verifier }) => {
      if (typeof code !== "string" || typeof code_verifier !== "string") throw new Refusal(400, "code and code_verifier are required");
      const r = await sandboxCall("POST", new URL(held.tokenEndpoint).pathname, {
        form: {
          grant_type: "authorization_code", code, redirect_uri: held.redirect, code_verifier, resource,
          client_id: held.client.id, client_secret: held.client.secret,
        },
      });
      if (r.status !== 200 || typeof r.json?.access_token !== "string") {
        held.token = null;
        return { status: r.status, error: r.json?.error ?? null, error_description: r.json?.error_description ?? null };
      }
      held.token = r.json.access_token;
      return {
        status: 200, token: cut(held.token), token_type: r.json.token_type ?? null,
        expires_in: r.json.expires_in ?? null, scope: r.json.scope ?? null,
      };
    },

    // Step 5: the read, with the token this process holds.
    "POST /api/read": async () => {
      if (!held.token) throw new Refusal(409, "no token is held yet; run the exchange first");
      const url = `${sourceFetch}/v1/source/${encodeURIComponent(scope)}?owner=${encodeURIComponent(held.person.did)}`;
      const headers = { accept: "application/json", authorization: "Bearer " + held.token };
      // The source compares a token's audience with the address the caller used.
      // When this process reaches the source another way than the browser does,
      // it says which address it means.
      // fetch does not let a caller set Host, so this one request goes through
      // the http module.
      const res = sourceFetch !== source ? await getWithHost(url, { ...headers, host: new URL(source).host }) : await net(url, { headers });
      let body = null;
      try { body = await res.json(); } catch (_) { /* not JSON */ }
      const out = { status: res.status, www_authenticate: res.headers.get("www-authenticate") };
      if (res.status === 200 && body) {
        out.receipt = {
          consent_id: tail(body.consent_id), ledger_entry_hash: cut(body.ledger_entry_hash), access_recorded: body.access_recorded === true,
        };
        out.persona = body.persona?.display_name ?? null;
        out.data = body.data ?? null;
        const led = await sandboxCall("GET", `/v1/consent/ledger/${encodeURIComponent(held.person.did)}`, { bearer: held.person.session });
        const line = (led.json?.entries ?? []).filter((e) => e.event_type === "data_access").at(-1);
        out.access_record = line?.description ?? null;
      } else {
        out.error = body?.error ?? null;
        out.detail = typeof body?.detail === "string" ? body.detail : null;
      }
      return out;
    },

    // Step 5, last part: the person revokes in the data-rights panel (its API).
    "POST /api/revoke": async () => {
      const s = await sandboxCall("GET", "/v1/panel/summary", { bearer: held.person.session });
      const mine = (s.json?.grants ?? []).filter((g) => (g.grantee?.id ?? g.grantee) === held.client.id);
      const done = [];
      for (const g of mine) {
        const id = g.consent_id ?? g.id;
        const r = await sandboxCall("POST", "/v1/panel/revoke", { bearer: held.person.session, body: { consent_id: id } });
        done.push({ consent_id: tail(id), status: r.status, tokens_invalidated: r.json?.tokens_invalidated ?? null });
      }
      return { revoked: done };
    },
  };

  class Refusal extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > 16384) throw new Refusal(413, "body too large");
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (_) { throw new Refusal(400, "body is not JSON"); }
  }

  const SECURITY = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; connect-src *; frame-ancestors 'self'",
  };

  async function handler(req, res) {
    const path = new URL(req.url || "/", "http://x").pathname;
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "content-type": type, ...SECURITY });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
      log(`${req.method} ${path} ${status}`);
    };
    try {
      const file = req.method === "GET" && STATIC[path];
      if (file) return send(200, await readFile(new URL(file[0], HERE), "utf8"), file[1]);
      const route = api[`${req.method} ${path}`];
      if (!route) return send(404, { error: "not_found" });
      // Only this page may drive the backend: a request from another origin is
      // refused, and a POST has to be JSON, which a form on another site cannot send.
      const origin = req.headers.origin;
      // A POST with no Origin header is refused too: a browser always sends one.
      if ((origin || req.method === "POST") && origin !== held.origin) return send(403, { error: "wrong_origin" });
      if (req.method === "POST" && !/^application\/json/.test(req.headers["content-type"] || "")) {
        return send(415, { error: "json_required" });
      }
      const body = req.method === "POST" ? await readJson(req) : {};
      return send(200, await route(body));
    } catch (e) {
      if (e instanceof Refusal) return send(e.status, { error: "refused", detail: e.message });
      return send(500, { error: "internal_error" });
    }
  }

  return {
    get port() { return server?.address()?.port; },
    get held() { return held; },
    async start() {
      server = http.createServer(handler);
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(wantedPort, host, resolve); });
      const port = server.address().port;
      // The page is served at the loopback address; the sandbox accepts a
      // loopback redirect URI on the sandbox only.
      held.origin = `http://127.0.0.1:${port}`;
      held.redirect = `${held.origin}/callback`;
      try {
        await register();
      } catch (e) {
        await new Promise((resolve) => server.close(resolve));
        await cleanup();
        throw e;
      }
      log(`registered the sandbox client ${held.client.id} and the synthetic person ${held.person.did}`);
      return held.origin;
    },
    async stop() {
      server?.closeAllConnections?.();
      await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
      await cleanup();
    },
  };
}

// Started directly: serve. Imported (by the tests): export only.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const page = createPage({
    sandbox: process.env.LIFECAREID_SANDBOX_ORIGIN || undefined,
    devaccess: process.env.LIFECAREID_DEVACCESS_TOKEN || "",
    source: process.env.SOURCE || undefined,
    sourceFetch: process.env.SOURCE_FETCH || undefined,
    scope: process.env.SCOPE || undefined,
    port: Number(process.env.PORT || 4000),
    host: process.env.HOST || "127.0.0.1",
  });
  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    await page.stop();
    process.exit(code);
  };
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
  try {
    const origin = await page.start();
    console.log(`open ${origin}  (a sandbox walk with a synthetic person; nothing here is production)`);
  } catch (e) {
    console.log(`could not start: ${e.message}`);
    process.exit(1);
  }
}
