// Person-managed authorization, server half (draft 1).
//
// For an MCP server or a resource API that holds something of a person's. It
// does five things and nothing else:
//
//   1. publishes protected resource metadata (RFC 9728) that names the
//      authorization server, so a client that follows the standard is led to the
//      person's yes and not to you;
//   2. answers 401 with the resource_metadata challenge (and the one scope it
//      suggests) when no valid token is presented;
//   3. accepts a token only when the authorization server says it is active,
//      that it is an access token, that its grantee is a client you accept and
//      that its audience, when it has one, is this resource, checking at EVERY
//      request and caching nothing, so a stop holds at the next request;
//   4. refuses a token that covers another scope on that one call, with the 403
//      step-up header that tells a client which scope to ask the person for;
//   5. writes one line to the person's ledger for every read, before the read
//      is served, and hands back the receipt: the consent id and a hash, never
//      a value.
//
// The library never sees the data it protects. It is not a gateway, a proxy or
// a vault: it runs in your process, and the data goes from you to the caller.
// It uses web-standard Request and Response; node.js and pages.js adapt it to
// Node's http module and to a Cloudflare Pages Function.
import { baseUrl, originOf, receiptFields, scopeToken } from "./shared.js";

const MAX_TOKEN_LENGTH = 4096;
const DEFAULT_TIMEOUT_MS = 8000;

// A refusal: { detail, error } and an HTTP status, with the challenge header
// for the statuses that carry one. profile draft 1 may change this (the body
// shape and the error codes follow what the hosted sandbox source answers).
export class Refusal extends Error {
  constructor(status, error, detail, { scope } = {}) {
    super(detail);
    this.name = "Refusal";
    this.status = status;
    this.error = error;
    this.detail = detail;
    this.scope = scope;
  }
  body() {
    return { detail: this.detail, error: this.error };
  }
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const GRANTEE_MODES = new Set(["own", "any"]);

export class ResourceServer {
  #secret;
  #fetch;

  // options:
  //   resource               the identifier of this resource, an https URL (http on loopback
  //                          for a server on your machine): the `resource` of your metadata and the
  //                          `aud` a token must carry when it carries one
  //   authorizationServer    the issuer you accept tokens from, for example https://sandbox.lifecare.id
  //   clientId, clientSecret this server's own registered client at that issuer. It is
  //                          used to ask the issuer about a token and to write the ledger
  //                          line, and goes only to the issuer's origin
  //   scopes                 the scopes this resource understands (published in the metadata)
  //   scope                  the one scope a 401 suggests (default: the first of scopes)
  //   grantees               which clients may hold a token for this resource:
  //                          "own" (default; only this server's own registered client),
  //                          "any" (any client the issuer names as grantee),
  //                          an array of client ids, or a function (clientId, grant) => boolean
  //   accessor               the name written into the person's ledger line (default: the resource host)
  //   documentation          optional URL for `resource_documentation`
  //   introspectionEndpoint, recordEndpoint
  //                          profile draft 1 may change this: default to the paths the
  //                          LifeCare.ID® API uses under the issuer; must stay on the issuer's origin
  //   fetch, timeoutMs       for tests and slow networks
  constructor(options = {}) {
    const o = options;
    this.resource = baseUrl(o.resource, "resource");
    this.issuer = baseUrl(o.authorizationServer, "authorizationServer");
    if (!o.clientId || !o.clientSecret) {
      throw new TypeError("clientId and clientSecret are required: this server's own registered client at the authorization server");
    }
    this.clientId = String(o.clientId);
    this.#secret = String(o.clientSecret);
    this.scopes = (o.scopes || []).map((s) => scopeToken(s, "scopes"));
    if (!this.scopes.length) throw new TypeError("scopes must name at least one scope this resource understands");
    this.scope = scopeToken(o.scope ?? this.scopes[0], "scope");
    const grantees = o.grantees ?? "own";
    if (!(GRANTEE_MODES.has(grantees) || Array.isArray(grantees) || typeof grantees === "function")) {
      throw new TypeError('grantees must be "own", "any", an array of client ids or a function');
    }
    this.grantees = grantees;
    this.accessor = String(o.accessor || new URL(this.resource).host);
    this.documentation = o.documentation || null;
    // profile draft 1 may change this
    this.introspectionEndpoint = o.introspectionEndpoint || this.issuer + "/v1/token/introspect";
    // profile draft 1 may change this
    this.recordEndpoint = o.recordEndpoint || this.issuer + "/v1/access/record";
    for (const [name, url] of [["introspectionEndpoint", this.introspectionEndpoint], ["recordEndpoint", this.recordEndpoint]]) {
      if (originOf(url) !== originOf(this.issuer)) {
        throw new TypeError(`${name} must be on the issuer's origin (${originOf(this.issuer)}): the client secret goes only to the origin you configured`);
      }
    }
    this.timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = o.fetch || ((...a) => fetch(...a));
    // RFC 9728 section 3.1: the well-known segment goes between the host and the path.
    const path = new URL(this.resource).pathname.replace(/\/+$/, "");
    this.metadataPath = "/.well-known/oauth-protected-resource" + path;
    this.metadataUrl = originOf(this.resource) + this.metadataPath;
  }

  // ---- 1. the metadata ----------------------------------------------------

  // RFC 9728 protected resource metadata. profile draft 1 may change this.
  protectedResourceMetadata() {
    const doc = {
      resource: this.resource,
      authorization_servers: [this.issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [...this.scopes],
    };
    if (this.documentation) doc.resource_documentation = this.documentation;
    return doc;
  }

  metadataResponse(request) {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
      "access-control-max-age": "600",
    };
    const method = request?.method || "GET";
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (method !== "GET" && method !== "HEAD") {
      return json(405, { detail: "metadata is read with GET", error: "method_not_allowed" }, { allow: "GET, HEAD, OPTIONS", ...cors });
    }
    return json(200, this.protectedResourceMetadata(), { "cache-control": "public, max-age=300", ...cors });
  }

  // ---- 2. the challenge ---------------------------------------------------

  // The WWW-Authenticate value for a refusal (RFC 6750 section 3, RFC 9728
  // section 5.1). profile draft 1 may change this: the `scope` the 401
  // suggests, and its absence once a token was presented.
  challenge(refusal) {
    if (refusal.status === 401) {
      const params = [`resource_metadata="${this.metadataUrl}"`];
      if (refusal.error === "invalid_token") params.push('error="invalid_token"');
      else params.push(`scope="${this.scope}"`);
      return "Bearer " + params.join(", ");
    }
    if (refusal.status === 403 && refusal.error === "insufficient_scope" && refusal.scope) {
      return `Bearer error="insufficient_scope", scope="${refusal.scope}", resource_metadata="${this.metadataUrl}"`;
    }
    return null;
  }

  refusalResponse(refusal) {
    const headers = { "access-control-expose-headers": "WWW-Authenticate" };
    const challenge = this.challenge(refusal);
    if (challenge) headers["www-authenticate"] = challenge;
    return json(refusal.status, refusal.body(), headers);
  }

  // ---- 3 and 4. the token, at every request -------------------------------

  // Authenticate one request. Asks the authorization server about the token
  // every time and caches nothing. Throws a Refusal; returns the grant the
  // token stands for. With `scope`, also refuses a token that covers another
  // scope, with the step-up refusal.
  async authenticate(request, { scope } = {}) {
    const token = bearerToken(request);
    const info = await this.#introspect(token);
    const grant = this.#grantFrom(info);
    if (scope !== undefined) this.requireScope(grant, scope);
    return grant;
  }

  // The scope check, on its own, for a server that learns the scope from the
  // body of the call (an MCP tools/call). Refuses a single call with the 403
  // step-up refusal; a JSON-RPC batch cannot be answered with one status, so a
  // server that accepts batches answers the refused element in band.
  requireScope(grant, scope) {
    if (!grant.scopes.includes(scope)) {
      throw new Refusal(403, "insufficient_scope",
        `the token covers scope ${JSON.stringify(grant.scope)}, not ${JSON.stringify(scope)}`, { scope });
    }
  }

  async #introspect(token) {
    const unavailable = new Refusal(503, "introspection_unavailable",
      "the authorization server could not be asked about this token, so nothing is served");
    let res;
    try {
      res = await this.#post(this.introspectionEndpoint, { token });
    } catch (_) {
      throw unavailable;
    }
    // The issuer refused this server, not the token: its own client credentials
    // are missing or wrong. The caller's token was never looked up.
    if (res.status === 401 || res.status === 403) {
      throw new Refusal(503, "server_not_authorized",
        "the authorization server did not accept this server's own client credentials, so nothing is served");
    }
    let info;
    try {
      if (!res.ok) throw new Error("status " + res.status);
      info = await res.json();
    } catch (_) {
      throw unavailable;
    }
    return info;
  }

  #grantFrom(info) {
    const inactive = () => new Refusal(401, "invalid_token", "token inactive or unknown");
    if (!info || info.active !== true) throw inactive();
    // Defence in depth: the issuer already answers active:false past expiry.
    if (info.expires_at && Date.parse(info.expires_at) <= Date.now()) throw inactive();
    // Fail closed on any token_type this server does not implement. A session
    // token says who the caller is, not what may be read.
    if (info.token_type !== "access") {
      throw new Refusal(403, "wrong_token_type", 'a data-access token is required (token_type "access")');
    }
    // Audience (RFC 8707; MCP authorization, token audience binding): a token
    // issued for a named resource must name this one. A token with no `aud`
    // (the walkthrough's POST /v1/token) is accepted. profile draft 1 may change this.
    if (info.aud !== undefined && info.aud !== null) {
      const audiences = Array.isArray(info.aud) ? info.aud : [info.aud];
      if (!audiences.includes(this.resource)) {
        throw new Refusal(401, "invalid_token", "the token was issued for another resource");
      }
    }
    // profile draft 1 may change this: the grantee is the client the token was issued to.
    const grantee = typeof info.requester === "string" && info.requester ? info.requester : null;
    const grant = {
      owner: info.resource_owner,
      scope: typeof info.scope === "string" ? info.scope : "",
      scopes: typeof info.scope === "string" ? info.scope.split(/\s+/).filter(Boolean) : [],
      purpose: typeof info.purpose === "string" ? info.purpose : "",
      grantee,
      consentId: typeof info.consent_id === "string" && info.consent_id ? info.consent_id : null,
      expiresAt: info.expires_at || null,
      audience: info.aud ?? null,
    };
    if (typeof grant.owner !== "string" || !grant.owner.startsWith("did:")) {
      throw new Refusal(403, "wrong_subject", "the token names no resource owner");
    }
    if (!this.#granteeAccepted(grant)) {
      throw new Refusal(403, "wrong_grantee", "the token was issued to a client this server does not accept");
    }
    return grant;
  }

  #granteeAccepted(grant) {
    if (!grant.grantee) return false;
    if (this.grantees === "any") return true;
    if (this.grantees === "own") return grant.grantee === this.clientId;
    if (Array.isArray(this.grantees)) return this.grantees.includes(grant.grantee);
    return Boolean(this.grantees(grant.grantee, grant));
  }

  // ---- 5. the receipt -----------------------------------------------------

  // Write one line to the person's ledger for this read and return the
  // receipt. Called BEFORE the read is served: an access that cannot be
  // written is not served (503). Only { subject_did, scope, purpose, accessor,
  // consent_id } leaves this server: never a value. profile draft 1 may change this.
  async record(grant) {
    const line = {
      subject_did: grant.owner,
      scope: grant.scope,
      purpose: grant.purpose || "",
      accessor: this.accessor,
    };
    if (grant.consentId) line.consent_id = grant.consentId;
    try {
      const res = await this.#post(this.recordEndpoint, line);
      if (!res.ok) throw new Error("status " + res.status);
      const body = await res.json();
      if (!body || body.recorded !== true) throw new Error("not recorded");
      return receiptFields({
        consent_id: grant.consentId,
        ledger_entry_hash: body.entry_hash,
        access_recorded: true,
      });
    } catch (_) {
      throw new Refusal(503, "access_record_failed",
        "the access could not be written to the owner's ledger, so nothing is served");
    }
  }

  async #post(url, body) {
    return this.#fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: "Basic " + Buffer.from(`${this.clientId}:${this.#secret}`).toString("base64"),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  // ---- handlers -----------------------------------------------------------

  // Wrap a handler so each call is authenticated, recorded and then served.
  // `handler(request, { grant, receipt, ...ctx })` returns a Response, or a
  // plain object: the receipt fields are added to it and it is sent as JSON.
  // This is the read path for a resource API. profile draft 1 may change this
  // (the receipt travels in the body, as the sandbox source's does).
  protect(handler, { scope } = {}) {
    return async (request, ctx = {}) => {
      try {
        const grant = await this.authenticate(request, { scope });
        const receipt = await this.record(grant);
        const out = await handler(request, { ...ctx, grant, receipt });
        if (out instanceof Response) return out;
        return json(200, { ...(out ?? {}), ...receipt });
      } catch (e) {
        return this.#failure(e);
      }
    };
  }

  // Serve the metadata at its well-known path and hand everything else to
  // `handler`, which is already a web handler (request, ctx) => Response and
  // does its own authenticate/record (an MCP server does: initialize and
  // tools/list are authorized but are not reads). A thrown Refusal becomes its
  // response; anything else becomes a 500 that says nothing about the cause.
  route(handler) {
    return async (request, ctx = {}) => {
      try {
        if (new URL(request.url).pathname === this.metadataPath) return this.metadataResponse(request);
        return await handler(request, ctx);
      } catch (e) {
        return this.#failure(e);
      }
    };
  }

  // protect() plus the metadata route: the whole thing for a resource API.
  fetchHandler(handler, { scope, raw = false } = {}) {
    return this.route(raw ? handler : this.protect(handler, { scope }));
  }

  #failure(e) {
    if (e instanceof Refusal) return this.refusalResponse(e);
    return json(500, { detail: "internal error", error: "internal_error" });
  }
}

export function createResourceServer(options) {
  return new ResourceServer(options);
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "").trim() : "";
  if (!token) {
    throw new Refusal(401, "missing_token", "present an access token as Authorization: Bearer <token>");
  }
  if (token.length > MAX_TOKEN_LENGTH) throw new Refusal(401, "invalid_token", "token inactive or unknown");
  return token;
}
