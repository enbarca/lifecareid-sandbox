// Test doubles: an authorization server that behaves the way the hosted
// sandbox does (discovery, authorize, token with PKCE and resource,
// introspection by authenticated clients, access record, revoke), and helpers
// to run the library's resource server on a real port. Synthetic ids only.
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

import { createResourceServer } from "../src/server.js";
import { nodeHandler, toRequest, writeResponse } from "../src/node.js";
import { syntheticMcp } from "../../../examples/person-managed-auth/synthetic-mcp.mjs";

const b64url = (buf) => buf.toString("base64url");
const rand = (n = 12) => b64url(randomBytes(n));

export function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${srv.address().port}`;
      resolve({ origin, srv, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }) });
    });
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

function basicCreds(req) {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!m) return null;
  const [id, ...rest] = Buffer.from(m[1], "base64").toString().split(":");
  return { id, secret: rest.join(":") };
}

// profile: which discovery documents the issuer publishes.
export async function startIssuer({ rfc8414 = true, openid = false, expiresIn = 1200, aud = true, tokenType = "access",
  allowedResources = null, scopesSupported = ["daily", "cgm", "recovery"] } = {}) {
  const clients = new Map();   // id -> { secret, redirect_uris }
  const codes = new Map();
  const tokens = new Map();
  const grants = new Map();    // consent id -> { revoked }
  const ledger = [];
  const log = [];              // every request: method, path, hadBasic, bodyHasSecret, hadBearer
  let authorizeCount = 0;

  const l = await listen(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const body = req.method === "POST" ? await readBody(req) : "";
    log.push({ method: req.method, path: url.pathname, hadBasic: /^Basic /i.test(req.headers.authorization || ""),
      hadBearer: /^Bearer /i.test(req.headers.authorization || ""), bodyHasSecret: /client_secret=/.test(body) });
    const issuer = l.origin;
    const metadata = {
      issuer,
      authorization_endpoint: issuer + "/authorize",
      token_endpoint: issuer + "/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      scopes_supported: scopesSupported,
      authorization_response_iss_parameter_supported: true,
    };
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return rfc8414 ? send(res, 200, metadata) : send(res, 404, { error: "not_found" });
    }
    if (url.pathname === "/.well-known/openid-configuration") {
      // an OpenID Connect document carries its own required members
      const oidc = { ...metadata, jwks_uri: issuer + "/.well-known/jwks.json", subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["ES256"] };
      return openid ? send(res, 200, oidc) : send(res, 404, { error: "not_found" });
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const form = new URLSearchParams(body);
      const basic = basicCreds(req);
      const id = form.get("client_id") || basic?.id;
      const secret = form.get("client_secret") || basic?.secret;
      const client = clients.get(id);
      if (!client || client.secret !== secret) return send(res, 401, { error: "invalid_client" });
      const code = codes.get(form.get("code"));
      codes.delete(form.get("code"));
      if (!code || code.client_id !== id || code.redirect_uri !== form.get("redirect_uri")) return send(res, 400, { error: "invalid_grant" });
      const verifier = form.get("code_verifier") || "";
      if (b64url(createHash("sha256").update(verifier).digest()) !== code.challenge) return send(res, 400, { error: "invalid_grant", error_description: "pkce" });
      if (form.get("resource") !== code.resource) return send(res, 400, { error: "invalid_target" });
      const access_token = "lc_" + rand(24);
      tokens.set(access_token, {
        consent_id: code.consent_id, scope: code.scope, owner: code.owner, requester: id, purpose: code.purpose,
        aud: code.resource, expires_at: Date.now() + expiresIn * 1000,
      });
      return send(res, 200, { access_token, token_type: "Bearer", expires_in: expiresIn, scope: code.scope });
    }
    if (url.pathname === "/v1/token/introspect" && req.method === "POST") {
      const c = basicCreds(req);
      if (!c || !clients.has(c.id) || clients.get(c.id).secret !== c.secret) return send(res, 401, { detail: "client authentication required" }, { "www-authenticate": 'Basic realm="x"' });
      const t = tokens.get(JSON.parse(body).token);
      if (!t || grants.get(t.consent_id)?.revoked || t.expires_at <= Date.now()) return send(res, 200, { active: false });
      const info = {
        active: true, token_type: tokenType, resource_owner: t.owner, scope: t.scope, purpose: t.purpose,
        requester: t.requester, consent_id: t.consent_id, expires_at: new Date(t.expires_at).toISOString(),
      };
      if (aud && t.aud) info.aud = t.aud;
      return send(res, 200, info);
    }
    if (url.pathname === "/v1/access/record" && req.method === "POST") {
      const c = basicCreds(req);
      if (!c || !clients.has(c.id) || clients.get(c.id).secret !== c.secret) return send(res, 401, { detail: "client authentication required" });
      const line = JSON.parse(body);
      ledger.push({ ...line, by: c.id });
      return send(res, 200, { recorded: true, entry_hash: createHash("sha256").update(JSON.stringify(line) + ledger.length).digest("hex") });
    }
    send(res, 404, { error: "not_found" });
  });

  const api = {
    origin: l.origin,
    log, ledger, tokens, grants,
    authorizeCount: () => authorizeCount,
    registerClient(name = "client") {
      const id = "sbx_" + rand(8);
      const secret = rand(24);
      clients.set(id, { secret, name, redirect_uris: ["http://127.0.0.1:4000/callback"] });
      return { client_id: id, client_secret: secret, redirect_url: "http://127.0.0.1:4000/callback" };
    },
    // The person's yes, as the hosted sandbox's ceremony would answer it: the
    // authorize request is checked and a code goes back to the redirect URI.
    // The library never does this; the test stands in for the person.
    yes(authorizeUrl, { owner = "did:web:example.test:u:synthetic01", reuse } = {}) {
      authorizeCount += 1;
      const u = new URL(authorizeUrl);
      const p = u.searchParams;
      const client = clients.get(p.get("client_id"));
      if (u.origin !== l.origin || u.pathname !== "/authorize") throw new Error("not the issuer's authorize endpoint: " + u.origin);
      if (!client) throw new Error("unknown client");
      if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) throw new Error("not authorization code with PKCE");
      if (!client.redirect_uris.includes(p.get("redirect_uri"))) throw new Error("redirect_uri not registered");
      const scope = p.get("scope");
      if (!scope || /\s/.test(scope)) throw new Error("one scope per token, got " + JSON.stringify(scope));
      const resource = p.get("resource");
      if (allowedResources && !allowedResources.includes(resource)) throw new Error("invalid_target");
      const consent_id = reuse || "urn:lifecare:consent:" + rand(12);
      grants.set(consent_id, grants.get(consent_id) || { revoked: false });
      const code = rand(18);
      codes.set(code, { client_id: p.get("client_id"), redirect_uri: p.get("redirect_uri"), challenge: p.get("code_challenge"),
        scope, resource, owner, consent_id, purpose: p.get("purpose") || "Data access by " + client.name });
      const cb = new URL(p.get("redirect_uri"));
      cb.searchParams.set("code", code);
      cb.searchParams.set("state", p.get("state"));
      cb.searchParams.set("iss", l.origin);
      return cb.toString();
    },
    no(authorizeUrl) {
      const p = new URL(authorizeUrl).searchParams;
      const cb = new URL(p.get("redirect_uri"));
      cb.searchParams.set("error", "access_denied");
      cb.searchParams.set("state", p.get("state"));
      cb.searchParams.set("iss", l.origin);
      return cb.toString();
    },
    revoke(consentId) { grants.set(consentId, { revoked: true }); },
    close: l.close,
  };
  return api;
}

// The library's resource server on a real port, in front of the synthetic MCP
// endpoint, registered as its own client at the given issuer.
export async function startResource(issuer, { grantees = "any", scopes = ["daily", "cgm", "recovery"], scope = "daily", raw = true } = {}) {
  const own = issuer.registerClient("server");
  let server;
  const hits = [];   // every request that reached the resource, with whether it carried a token
  const l = await listen((req, res) => {
    hits.push({ method: req.method, path: req.url, hadToken: /^Bearer /i.test(req.headers.authorization || "") });
    return nodeHandler(server, syntheticMcp(server), { raw })(req, res);
  });
  server = createResourceServer({
    resource: l.origin + "/mcp",
    authorizationServer: issuer.origin,
    clientId: own.client_id, clientSecret: own.client_secret,
    scopes, scope, grantees, accessor: "example-mcp",
  });
  return { server, origin: l.origin, resource: l.origin + "/mcp", client: own, hits, close: l.close };
}

export { toRequest, writeResponse };
export const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
