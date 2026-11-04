// Person-managed authorization, client half (draft 1).
//
// For an agent that reads something of a person's from a server. It asks the
// person once, through the standard, carries the token and the receipt, and
// stops when the person says stop:
//
//   - it discovers the server's protected resource metadata (RFC 9728, the
//     path form and then the root form) and then the authorization server's
//     metadata (RFC 8414, then OpenID), as the MCP authorization specification
//     requires, using the official MCP SDK's OAuthClientProvider and transport;
//   - it uses a client you registered (a confidential client, client_secret_post;
//     there is no dynamic registration code path here, and public clients are
//     the profile's business, not this draft's);
//   - it runs the authorization code flow with PKCE, and the person's yes
//     happens on the authorization server's own origin and nowhere else: the
//     library never renders the yes. It hands you the authorize URL and takes
//     back the callback;
//   - one scope per token. When a call needs another scope the server answers
//     403 with the step-up header, and the library re-runs authorization for
//     that one scope alone, never the union;
//   - every read's receipt is kept as a consent id and a hash, never a value;
//   - when the person revokes, the next call fails with PersonStopped, the
//     token is dropped, `stopped` fires, and nothing retries by itself.
//
// A credential you hold (the client secret, a token) goes only to the origin
// you configured: the client secret to `issuer`, the token to `resource`. A
// discovered issuer that differs stops the run with a line naming it.
//
// Two behaviours of the SDK (1.32.2) that this library works with, not around:
// on a 401 the SDK reads the challenge only on a transport request (calling
// its auth() directly never does), and on a 403 step-up it re-runs
// authorization but does not resend the call, so a call that needs another
// scope returns { ok: false, ask } and you call it again after finishAuth.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { baseUrl, challengeParams, cut, originOf, sameUrl, scopeToken } from "./shared.js";

// ---- errors ---------------------------------------------------------------

class PmaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

// The person revoked the grant (or it ended early). The token is dropped, the
// agent is stopped, nothing retries. Read `agent.stopped` for the signal.
export class PersonStopped extends PmaError {
  constructor({ scope, consentId, resource, at }) {
    super("person_stopped",
      `The person stopped this agent: the access token for ${scope || "its scope"} was refused before its time. ` +
      "It has been dropped and the agent will not ask again by itself.");
    this.scope = scope || null;
    this.consentId = consentId || null;
    this.resource = resource;
    this.at = at;
  }
}

// A discovered issuer (or an endpoint) is not the one you configured.
export class IssuerMismatch extends PmaError {
  constructor(message, { discovered, configured }) {
    super("issuer_mismatch", message);
    this.discovered = discovered;
    this.configured = configured;
  }
}

// The library refused to send a held credential to an origin you did not configure.
export class CredentialOriginRefused extends PmaError {
  constructor(what, to, allowed) {
    super("credential_origin_refused",
      `Refused to send the ${what} to ${to}. This agent sends it only to ${allowed}, the origin you configured.`);
    this.to = to;
    this.allowed = allowed;
  }
}

// The server named no single scope and none was configured.
export class ScopeRequired extends PmaError {
  constructor(offered) {
    super("scope_required",
      "Tokens are single scope. The server did not name one scope to ask for" +
      (offered ? ` (it offered: ${offered})` : "") + ". Set `scope` to the one scope this agent needs.");
  }
}

// The person answered no, or the authorization server returned an error.
export class PersonDeclined extends PmaError {
  constructor(error, description) {
    super("person_declined",
      error === "access_denied" ? "The person said no. Nothing was granted and nothing will retry." :
        `The authorization server answered ${error}${description ? ": " + description : ""}.`);
    this.error = error;
  }
}

// The callback did not match the request this agent made (state, issuer).
export class CallbackMismatch extends PmaError {
  constructor(message) {
    super("callback_mismatch", message);
  }
}

// The resource refused a token on its first use: not a stop, a mismatch
// (audience, grantee, scope) between this token and this resource.
export class TokenRefused extends PmaError {
  constructor(resource) {
    super("token_refused",
      `${resource} refused the token it was just issued. This is not the person's stop: check that the ` +
      "server accepts this client as a grantee and that the token's audience is this resource.");
    this.resource = resource;
  }
}

// ---- receipts -------------------------------------------------------------

// profile draft 1 may change this
// The receipt a read carries, as the hosted sandbox source answers today:
// consent_id, access_recorded, ledger_entry_hash at the top of the result. Only
// those reference fields are read; nothing else in the result is kept.
export function receiptOf(result) {
  if (!result || result.isError) return null;
  const candidates = [];
  if (result.structuredContent && typeof result.structuredContent === "object") candidates.push(result.structuredContent);
  for (const part of result.content ?? []) {
    if (part?.type !== "text") continue;
    try {
      const parsed = JSON.parse(part.text);
      if (parsed && typeof parsed === "object") candidates.push(parsed);
    } catch (_) { /* not JSON */ }
  }
  for (const c of candidates) {
    // A receipt for a read names the ledger line it was written to: the hash.
    if (typeof c.ledger_entry_hash === "string") {
      return {
        consent_id: typeof c.consent_id === "string" ? c.consent_id : null,
        ledger_entry_hash: typeof c.ledger_entry_hash === "string" ? c.ledger_entry_hash : null,
        access_recorded: c.access_recorded === true,
      };
    }
  }
  return null;
}

// Where receipts are kept. Memory by default; a file of JSON lines if you want
// them to outlive the process. Both keep consent ids and hashes only.
export class MemoryReceiptStore {
  #items = [];
  add(receipt) { this.#items.push({ ...receipt }); }
  list() { return this.#items.map((r) => ({ ...r })); }
}

export function fileReceiptStore(path) {
  return {
    add(receipt) { appendFileSync(path, JSON.stringify(receipt) + "\n", { mode: 0o600 }); },
    list() {
      if (!existsSync(path)) return [];
      return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
  };
}

// The credential rule, as a function: a held credential goes only to the
// origin configured for it. The access token only to the resource, the client
// secret (as HTTP Basic or in a form body) only to the issuer. Throws
// CredentialOriginRefused otherwise. Every request the SDK makes passes
// through this before it leaves the process.
export function assertCredentialOrigin({ url, authorization = "", bodyText = "", resourceOrigin, issuerOrigin }) {
  const origin = new URL(url).origin;
  if (/^bearer\s/i.test(authorization) && origin !== resourceOrigin) {
    throw new CredentialOriginRefused("access token", origin, resourceOrigin);
  }
  if ((/^basic\s/i.test(authorization) || /(?:^|&)client_secret=/.test(bodyText)) && origin !== issuerOrigin) {
    throw new CredentialOriginRefused("client secret", origin, issuerOrigin);
  }
}

// ---- the agent ------------------------------------------------------------

export class PersonManagedAgent {
  #o;
  #secret;
  #fetch;
  #now;
  #resourceOrigin;
  #issuerOrigin;
  #store;
  #provider;
  #client = null;
  #transport = null;
  #authTransport = null;
  #pending = null;        // { state, scope, reason, url }
  #verifier = null;
  #tokens = null;         // { token, savedAt }
  #everHeld = false;
  #lastScope = null;
  #proven = false;        // a held token has been accepted at the resource at least once
  #stepUpScope = null;
  #wantedScope = null;
  #issSupported = false;
  #fatal = null;
  #stopCtl = new AbortController();
  #stop = null;

  // options:
  //   resource      the MCP endpoint (or resource URL) you read from
  //   issuer        the authorization server you registered at: your client secret goes only here
  //   clientId, clientSecret   a client you registered there (confidential, client_secret_post)
  //   redirectUrl   one of the client's registered redirect URIs; the callback you hand to finishAuth
  //   clientName    shown to the person in the yes (default "Agent")
  //   scope         the one scope this agent needs (default: the one the server suggests)
  //   purpose       optional plain-text reason shown to the person and written into the grant;
  //                 a stable purpose lets a repeat request reuse the standing grant (profile draft 1 may change this)
  //   store         where receipts are kept (default: memory)
  //   onStopped     called once with the PersonStopped error when the person stops this agent
  //   introspectionEndpoint   profile draft 1 may change this; default <issuer>/v1/token/introspect
  //   fetch, now    for tests
  constructor(options = {}) {
    const o = options;
    this.resource = baseUrl(o.resource, "resource");
    this.issuer = baseUrl(o.issuer, "issuer");
    if (!o.clientId || !o.clientSecret) {
      throw new TypeError(
        "clientId and clientSecret are required: a client you registered at the issuer. " +
        "This draft has no dynamic registration; public clients are the profile's.");
    }
    if (!o.redirectUrl) throw new TypeError("redirectUrl is required: one of your client's registered redirect URIs");
    this.#o = {
      clientId: String(o.clientId),
      redirectUrl: String(o.redirectUrl),
      clientName: String(o.clientName || "Agent"),
      purpose: o.purpose ? String(o.purpose) : null,
      onStopped: o.onStopped || null,
      introspectionEndpoint: o.introspectionEndpoint || this.issuer + "/v1/token/introspect",
    };
    this.#secret = String(o.clientSecret);
    this.#wantedScope = o.scope ? scopeToken(o.scope, "scope") : null;
    this.#fetch = o.fetch || ((...a) => fetch(...a));
    this.#now = o.now || (() => Date.now());
    this.#resourceOrigin = originOf(this.resource);
    this.#issuerOrigin = originOf(this.issuer);
    if (originOf(this.#o.introspectionEndpoint) !== this.#issuerOrigin) {
      throw new TypeError(`introspectionEndpoint must be on the issuer's origin (${this.#issuerOrigin})`);
    }
    this.#store = o.store || new MemoryReceiptStore();
    this.#provider = this.#makeProvider();
  }

  // The signal the calling code watches. Aborted when the person stops this
  // agent; `signal.reason` is the PersonStopped error. After `connect({ askAgain:
  // true })` a fresh signal replaces it, so read the property each time.
  get stopped() {
    return this.#stopCtl.signal;
  }

  // ---- the SDK's OAuthClientProvider, built here and nowhere else ---------

  #makeProvider() {
    const self = this;
    // No saveClientInformation: there is no dynamic registration code path,
    // and the SDK refuses to present this client's secret to any authorization
    // server other than the one its information is stamped for.
    return {
      get redirectUrl() { return self.#o.redirectUrl; },
      get clientMetadata() {
        return {
          client_name: self.#o.clientName,
          redirect_uris: [self.#o.redirectUrl],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "client_secret_post",
        };
      },
      clientInformation() {
        return {
          client_id: self.#o.clientId,
          client_secret: self.#secret,
          redirect_uris: [self.#o.redirectUrl],
          token_endpoint_auth_method: "client_secret_post",
          issuer: self.issuer,
        };
      },
      tokens() { return self.#heldTokens(); },
      saveTokens(tokens) { self.#saveTokens(tokens); },
      state() { return randomBytes(16).toString("hex"); },
      redirectToAuthorization(url) { self.#onRedirect(url); },
      saveCodeVerifier(v) { self.#verifier = v; },
      codeVerifier() { return self.#verifier; },
      saveDiscoveryState(s) { self.#assertDiscovery(s); },
      validateResourceURL(_serverUrl, advertised) { return self.#validateResource(advertised); },
      invalidateCredentials() { self.#tokens = null; },
    };
  }

  #heldTokens() {
    if (!this.#tokens) return undefined;
    const { token, savedAt } = this.#tokens;
    // Tokens here have no refresh token. One past its lifetime (less a few
    // seconds) is not presented: it is ended, not stopped.
    if (typeof token.expires_in === "number" && this.#now() >= savedAt + token.expires_in * 1000 - 5000) return undefined;
    return token;
  }

  #saveTokens(tokens) {
    this.#tokens = { token: tokens, savedAt: this.#now() };
    this.#everHeld = true;
    this.#proven = false;
    this.#lastScope = tokens.scope || this.#lastScope;
  }

  // The SDK calls this after discovery and before anything is sent that
  // carries a credential. The issuer it found must be the one you configured.
  #assertDiscovery({ authorizationServerUrl, authorizationServerMetadata: md, resourceMetadata }) {
    const found = String(authorizationServerUrl);
    const fail = (message, discovered) => {
      this.#fatal = new IssuerMismatch(message, { discovered, configured: this.issuer });
      throw this.#fatal;
    };
    const stop = (discovered) =>
      `${this.resource} names the authorization server ${discovered}. This agent was configured for ${this.issuer} ` +
      `and sends its credentials only there. If you trust ${discovered}, set issuer to it yourself and use a client ` +
      "registered there. Nothing was sent.";
    if (!sameUrl(found, this.issuer)) {
      const discovered = found.replace(/\/+$/, "");
      fail(resourceMetadata ? stop(discovered) :
        `${this.resource} publishes no protected resource metadata, so discovery fell back to its own origin ${discovered}. ` +
        `This agent sends its credentials only to ${this.issuer}. Nothing was sent.`, discovered);
    }
    if (md) {
      if (md.issuer && !sameUrl(md.issuer, this.issuer)) fail(stop(md.issuer), md.issuer);
      for (const key of ["authorization_endpoint", "token_endpoint"]) {
        if (md[key] && originOf(md[key]) !== this.#issuerOrigin) fail(stop(originOf(md[key])), originOf(md[key]));
      }
      this.#issSupported = md.authorization_response_iss_parameter_supported === true;
    }
  }

  // The resource indicator the token will be bound to is the one you
  // configured. Metadata that advertises another is refused.
  #validateResource(advertised) {
    if (advertised && !sameUrl(advertised, this.resource)) {
      this.#fatal = new IssuerMismatch(
        `The metadata advertises the resource ${advertised}, not ${this.resource}, which you configured. Nothing was sent.`,
        { discovered: advertised, configured: this.resource });
      throw this.#fatal;
    }
    return new URL(this.resource);
  }

  // The SDK reached the point of sending the person somewhere: the yes. Record
  // what is being asked, decorate the URL, and hand it back to the caller.
  #onRedirect(url) {
    if (url.origin !== this.#issuerOrigin) {
      this.#fatal = new IssuerMismatch(`The authorize URL is on ${url.origin}, not on ${this.issuer}. Nothing was sent.`,
        { discovered: url.origin, configured: this.issuer });
      throw this.#fatal;
    }
    const urlScope = url.searchParams.get("scope") || "";
    let reason = "first";
    let scope;
    if (this.#stepUpScope) {
      reason = "step_up";
      scope = this.#stepUpScope;
    } else if (this.#everHeld) {
      reason = "expired";
      scope = this.#lastScope || this.#wantedScope || urlScope;
    } else {
      scope = this.#wantedScope || urlScope;
    }
    this.#stepUpScope = null;
    // One scope per token. Never the union, never "everything the server lists".
    if (!scope || /\s/.test(scope)) {
      this.#fatal = new ScopeRequired(urlScope.trim().split(/\s+/).join(", "));
      throw this.#fatal;
    }
    url.searchParams.set("scope", scope);
    // profile draft 1 may change this: purpose is a parameter of the hosted sandbox's yes.
    if (this.#o.purpose) url.searchParams.set("purpose", this.#o.purpose);
    this.#pending = { state: url.searchParams.get("state"), scope, reason, url: url.toString() };
  }

  // ---- every request the SDK makes passes through here --------------------

  #guardedFetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get("authorization") || "";
    const bodyText = typeof init?.body === "string" || init?.body instanceof URLSearchParams ? String(init.body) : "";
    const bearer = /^bearer\s/i.test(authorization);
    try {
      assertCredentialOrigin({ url, authorization, bodyText, resourceOrigin: this.#resourceOrigin, issuerOrigin: this.#issuerOrigin });
    } catch (e) {
      this.#fatal = e;
      throw e;
    }
    const res = await this.#fetch(input, init);
    if (bearer) this.#observe(res);
    return res;
  };

  // Read what the resource did with a request that carried our token.
  #observe(res) {
    if (res.ok) {
      this.#proven = true;
      return;
    }
    if (res.status === 403) {
      const p = challengeParams(res.headers.get("www-authenticate"));
      if (p.error === "insufficient_scope" && p.scope) this.#stepUpScope = p.scope;
      return;
    }
    if (res.status !== 401) return;
    if (!this.#proven) {
      // Refused on its first use: the token does not fit this resource.
      this.#tokens = null;
      this.#fatal = new TokenRefused(this.resource);
      throw this.#fatal;
    }
    // Accepted before and refused now, within its lifetime (an expired token is
    // never presented, see #heldTokens): the person's stop. No retry.
    this.#markStopped();
    throw this.#stop;
  }

  #markStopped() {
    if (this.#stop) return;
    const receipts = this.#store.list();
    const last = receipts.at(-1);
    this.#stop = new PersonStopped({
      scope: this.#lastScope,
      consentId: last?.consent_id,
      resource: this.resource,
      at: new Date(this.#now()).toISOString(),
    });
    this.#tokens = null;
    this.#closeQuietly();
    this.#stopCtl.abort(this.#stop);
    try { this.#o.onStopped?.(this.#stop); } catch (_) { /* the callback is yours; the stop stands */ }
  }

  #closeQuietly() {
    const client = this.#client;
    this.#client = null;
    this.#transport = null;
    client?.close().catch(() => {});
  }

  // Whatever the SDK threw, the typed error from this library wins: a stop
  // first, then the refusal a hook recorded, then the SDK's own.
  #surface(e) {
    if (this.#stop) return this.#stop;
    const fatal = this.#fatal;
    this.#fatal = null;
    return fatal || e;
  }

  #takePending() {
    const p = this.#pending;
    return p ? { authorizeUrl: p.url, scope: p.scope, reason: p.reason } : null;
  }

  // ---- the calls ----------------------------------------------------------

  // Connect to the resource. Returns { ok: true } when the agent holds a token
  // the resource accepts, or { ok: false, ask } when the person has to be
  // asked: send them to ask.authorizeUrl, take the callback URL they come back
  // to, and call finishAuth. With `ask` (an async function from the ask to the
  // callback URL), the library does that once for you. `askAgain: true` clears
  // a stop and starts a new request to the person; nothing else does.
  async connect({ scope, askAgain = false, ask } = {}) {
    if (this.#stop && !askAgain) throw this.#stop;
    if (askAgain) this.#resume();
    if (scope) this.#wantedScope = scopeToken(scope, "scope");
    return this.#withAsk(() => this.#connectOnce(), ask);
  }

  #resume() {
    // Ask again for what was stopped, unless the caller names another scope.
    if (!this.#wantedScope) this.#wantedScope = this.#lastScope;
    this.#stop = null;
    this.#stopCtl = new AbortController();
    this.#tokens = null;
    this.#pending = null;
    this.#everHeld = false;
    this.#lastScope = null;
    this.#closeQuietly();
  }

  async #connectOnce() {
    if (this.#client) return { ok: true };
    const transport = new StreamableHTTPClientTransport(new URL(this.resource), {
      authProvider: this.#provider,
      fetch: this.#guardedFetch,
    });
    const client = new Client({ name: this.#o.clientName, version: "0.1.0" });
    try {
      await client.connect(transport);
    } catch (e) {
      const ask = e instanceof UnauthorizedError ? this.#takePending() : null;
      if (ask && !this.#stop) {
        this.#authTransport = transport;
        return { ok: false, ask };
      }
      throw this.#surface(e);
    }
    this.#client = client;
    this.#transport = transport;
    return { ok: true };
  }

  async #withAsk(op, ask) {
    let r = await op();
    if (!r.ok && ask) {
      await this.finishAuth(await ask(r.ask));
      r = await op();
    }
    return r;
  }

  // The person has answered. `callback` is the URL they were redirected to
  // (as a string or URL) or { code, state, iss, error }. Checks state and
  // issuer, then exchanges the code for a token bound to this resource.
  async finishAuth(callback) {
    const pending = this.#pending;
    if (!pending || !this.#authTransport) throw new CallbackMismatch("No request to the person is waiting for an answer.");
    const p = parseCallback(callback);
    this.#pending = null;
    if (p.error) throw new PersonDeclined(p.error, p.error_description);
    if (!p.state || p.state !== pending.state) throw new CallbackMismatch("The callback does not carry the state this agent sent. Nothing was exchanged.");
    if (p.iss ? !sameUrl(p.iss, this.issuer) : this.#issSupported) {
      throw new CallbackMismatch(
        `The callback names ${p.iss ? "the issuer " + p.iss : "no issuer"}, not ${this.issuer}. Nothing was exchanged.`);
    }
    if (!p.code) throw new CallbackMismatch("The callback carries no code.");
    try {
      await this.#authTransport.finishAuth(p.code);
    } catch (e) {
      throw this.#surface(e);
    }
    // The failed transport is done with. A fresh one carries the new token.
    this.#authTransport = null;
    this.#closeQuietly();
    return this.showMyGrant();
  }

  // Call a tool. Returns { ok: true, result, receipt } or { ok: false, ask }
  // (the person must be asked: a first token, an ended one, or the step-up to
  // another scope). Throws PersonStopped when the person has stopped this agent.
  async callTool(name, args = {}, { ask } = {}) {
    if (this.#stop) throw this.#stop;
    return this.#withAsk(() => this.#callOnce(name, args), ask);
  }

  async #callOnce(name, args) {
    const connected = await this.#connectOnce();
    if (!connected.ok) return connected;
    let result;
    try {
      result = await this.#client.callTool({ name, arguments: args });
    } catch (e) {
      const ask = e instanceof UnauthorizedError ? this.#takePending() : null;
      if (ask && !this.#stop) {
        // The SDK re-ran authorization (the step-up) and did not resend the
        // call. The same transport takes the code; the call is yours to repeat.
        this.#authTransport = this.#transport;
        return { ok: false, ask };
      }
      throw this.#surface(e);
    }
    const found = receiptOf(result);
    let receipt = null;
    if (found) {
      receipt = { ...found, scope: this.#lastScope, tool: name, at: new Date(this.#now()).toISOString() };
      this.#store.add(receipt);
    }
    return { ok: true, result, receipt };
  }

  async listTools() {
    if (this.#stop) throw this.#stop;
    const connected = await this.#connectOnce();
    if (!connected.ok) return connected;
    try {
      return { ok: true, tools: (await this.#client.listTools()).tools };
    } catch (e) {
      throw this.#surface(e);
    }
  }

  // ---- what the agent can show --------------------------------------------

  // The grant this agent holds, as far as it knows: never the token itself.
  // `live: true` asks the issuer about the token (an introspection with this
  // agent's own credentials) and treats an inactive token that had not run out
  // as a stop.
  async showMyGrant({ live = false } = {}) {
    const held = this.#heldTokens();
    const last = this.#store.list().at(-1);
    const grant = {
      state: this.#stop ? "stopped" : held ? "held" : this.#everHeld ? "ended" : "none",
      resource: this.resource,
      issuer: this.issuer,
      scope: held?.scope || this.#lastScope || null,
      expires_at: this.#tokens && typeof this.#tokens.token.expires_in === "number"
        ? new Date(this.#tokens.savedAt + this.#tokens.token.expires_in * 1000).toISOString() : null,
      consent_id: last?.consent_id ?? null,
    };
    if (live && held && !this.#stop) {
      const info = await this.#introspectOwn(held.access_token);
      grant.live = info;
      if (info.active === false) {
        this.#markStopped();
        grant.state = "stopped";
      } else if (info.consent_id) {
        grant.consent_id = info.consent_id;
      }
    }
    return grant;
  }

  // profile draft 1 may change this: RFC 7662 at the issuer, as this agent's own client.
  async #introspectOwn(token) {
    const res = await this.#guardedFetch(this.#o.introspectionEndpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: "Basic " + Buffer.from(`${this.#o.clientId}:${this.#secret}`).toString("base64"),
      },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error(`the issuer answered ${res.status} to the introspection`);
    const body = await res.json();
    return {
      active: body.active === true,
      scope: body.scope ?? null,
      consent_id: body.consent_id ?? null,
      expires_at: body.expires_at ?? null,
    };
  }

  // Every receipt this agent has been handed: consent id, hash, scope, tool,
  // time. Never a value.
  showMyReceipts() {
    return this.#store.list();
  }

  async close() {
    this.#closeQuietly();
  }
}

export function createAgent(options) {
  return new PersonManagedAgent(options);
}

function parseCallback(input) {
  let params;
  if (typeof input === "string" || input instanceof URL) {
    params = new URL(String(input)).searchParams;
  } else if (input && typeof input === "object") {
    params = new URLSearchParams(Object.entries(input).filter(([, v]) => typeof v === "string"));
  } else {
    throw new CallbackMismatch("finishAuth takes the callback URL or { code, state, iss }.");
  }
  const get = (k) => params.get(k) || undefined;
  return { code: get("code"), state: get("state"), iss: get("iss"), error: get("error"), error_description: get("error_description") };
}

// For tests and for anyone logging: a code or token cut to ten characters.
export { cut };
