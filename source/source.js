// The sandbox synthetic source: a zero-PHI reference data source for the
// LifeCare.ID sandbox. A TEST FIXTURE, not a product surface.
//
// It behaves as a conforming resource host (https://developers.lifecare.id/data-sources)
// against the SANDBOX authorization server, and it serves five synthetic
// personas (personas.generated.js, generated upstream from the challenge readiness
// simulation's extract in data/simulator-extract.json). Interpreted outputs only: scores, bands,
// directions, dates and authored sentences. There is no raw reading in the data
// this module can reach, so none can leak.
//
// On every data request, in this order, with nothing cached between requests:
//   1. the bearer token is introspected at the sandbox (POST /v1/token/introspect),
//      the source presenting its own client credentials (RFC 7662 section 2.1)
//   2. active, token_type "access", scope and resource owner are enforced
//   3. the access is recorded in the owner's ledger (POST /v1/access/record)
//   4. the persona's data is served, directly to the caller
// The record comes BEFORE the response on purpose (ledger first): an access that
// cannot be written to the owner's ledger is not served.
//
// Two faces over the same handlers: REST (GET .../v1/source/{scope}) and a
// stateless streamable HTTP MCP endpoint (POST .../mcp). The MCP face is a test
// fixture for agent governance pilots. It is not the member MCP surface.
//
// Where the sandbox lives is deployment config, never source: the Pages project
// variable LIFECAREID_SANDBOX_ORIGIN. Unset, every data route answers 503.
import PERSONAS from "./personas.generated.js";

export const PREFIX = "/sandbox-source";
export const VERSION = "0.3.0";
export const ACCESSOR = "sandbox-source:synthetic-personas";
export const NOTICE =
  "Synthetic persona data from the LifeCare.ID® sandbox reference source. " +
  "Not a person. Zero PHI. Test fixture.";

// The fixed MVP scope vocabulary (https://developers.lifecare.id/scopes-and-consent) and
// what this source answers for each.
export const SCOPES = {
  cgm: "Glucose stability: the glycemic band, score and weekly direction. Covered for one persona only.",
  daily: "The daily summary: every pillar's band, coverage per day, the focus and the weekly summaries.",
  labs: "Laboratory results. No persona has any, and the source says so.",
  body_composition: "Muscle retention: a band and the direction of weight and lean mass. No mass, no percentage.",
  recovery: "Recovery: band, score, weekly direction and a sleep label.",
  activity: "Muscle stimulus from training: band, score, weekly direction and the training modality.",
  insights: "The newest derived insight per family, each a categorical label.",
};
export const WEEKLY_SUMMARY_SCOPE = "daily";

const MCP_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
// The modern era (2026-07-28 and later): no handshake, every request carries its
// own `_meta` stamp, and a client probes `server/discover` first. This server is
// stateless, so it serves both eras with the same handlers.
const MCP_MODERN_VERSIONS = ["2026-07-28"];
const MCP_DEFAULT_VERSION = "2025-06-18";
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_TOKEN_LENGTH = 512;
const PERSONA_PIN = /(?:^|[\s\[(;,])persona:(p[0-9]+-[a-z0-9-]+)/;

// The one scope the bare 401 challenge asks for: the broadest everyday scope,
// and the one the explainer and the live walk of 2026-11-03 used.
// profile draft 1 may change this
const CHALLENGE_SCOPE = "daily";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, accept, mcp-protocol-version, mcp-session-id",
  "access-control-max-age": "600",
};

// --------------------------------------------------------------------------
// responses
// --------------------------------------------------------------------------

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...CORS,
      ...extra,
    },
  });
}

// A refusal: { detail, error } in the service's own `detail` style, plus a
// stable machine code. Thrown by the checks, turned into a response per face.
export class Refusal extends Error {
  // `scope`: for a 403 insufficient_scope, the scope the read asked for, named in
  // the challenge so a client knows which scope to ask for (RFC 6750 section 3.1).
  constructor(status, error, detail, { scope } = {}) {
    super(detail);
    this.status = status;
    this.error = error;
    this.detail = detail;
    this.scope = scope;
  }
  body() {
    return { detail: this.detail, error: this.error };
  }
  // `resourceMetadata`: the RFC 9728 metadata URL, put in the 401 challenge on
  // the MCP path (RFC 9728 section 5.1; MCP authorization, "Protected Resource
  // Metadata Discovery Requirements"). `error="invalid_token"` is added only when
  // a token was presented and refused: RFC 6750 section 3.1 says a request that
  // carried no credentials gets a bare challenge, without an error code.
  //
  // The bare challenge on the MCP path also names the scope to ask for (RFC 6750
  // section 3; MCP authorization, "Protected Resource Metadata Discovery
  // Requirements": a client takes the challenge's `scope` first). Without it a
  // stock client asks for every entry of `scopes_supported`, and this issuer
  // mints single-scope tokens. A refused token gets no scope: the fault is the
  // token, not what was asked.
  //
  // A 403 insufficient_scope names the scope the read asked for, and on the MCP
  // path the metadata URL, so the client can start a new authorization (RFC 6750
  // section 3.1; the profile's step-up vector).
  response({ resourceMetadata } = {}) {
    let extra = {};
    if (this.status === 401) {
      const params = [];
      if (resourceMetadata) params.push(`resource_metadata="${resourceMetadata}"`);
      if (this.error === "invalid_token") params.push('error="invalid_token"');
      // profile draft 1 may change this
      if (resourceMetadata && this.error === "missing_token") params.push(`scope="${CHALLENGE_SCOPE}"`);
      extra = { "www-authenticate": params.length ? "Bearer " + params.join(", ") : "Bearer" };
    } else if (this.status === 403 && this.error === "insufficient_scope" && this.scope) {
      const params = ['error="insufficient_scope"', `scope="${this.scope}"`];
      if (resourceMetadata) params.push(`resource_metadata="${resourceMetadata}"`);
      extra = { "www-authenticate": "Bearer " + params.join(", ") };
    }
    return json(this.status, this.body(), extra);
  }
}

// --------------------------------------------------------------------------
// the sandbox authorization server
// --------------------------------------------------------------------------

function sandboxOrigin(env) {
  const origin = String((env && env.LIFECAREID_SANDBOX_ORIGIN) || "")
    .trim()
    .replace(/\/+$/, "");
  // https, or plain http on loopback for a sandbox run locally.
  if (/^https:\/\/[^/]+$/.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function requireOrigin(env) {
  const origin = sandboxOrigin(env);
  if (!origin) {
    throw new Refusal(503, "source_not_configured",
      "the source has no sandbox to check tokens against (LIFECAREID_SANDBOX_ORIGIN is unset)");
  }
  return origin;
}

async function post(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "lifecareid-sandbox-source/" + VERSION,
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

function bearer(request) {
  const header = request.headers.get("authorization") || "";
  const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "").trim() : "";
  if (!token) {
    throw new Refusal(401, "missing_token",
      "present a sandbox access token as Authorization: Bearer lc_...");
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Refusal(401, "invalid_token", "token inactive or unknown");
  }
  return token;
}

// The source's own client credentials, as HTTP Basic, from two Pages project
// variables: LIFECAREID_SANDBOX_SOURCE_CLIENT_ID and _SECRET, a client the
// sandbox knows. Presented on the introspection (the sandbox admits only an
// authenticated client, lifecareid audit F12, RFC 7662 section 2.1) and on the
// access record. Either variable unset: no header, and a sandbox that requires
// one answers 401, which the source reports as `source_not_authorized`.
export function sourceCredentials(env) {
  const id = env && env.LIFECAREID_SANDBOX_SOURCE_CLIENT_ID;
  const secret = env && env.LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET;
  return id && secret ? { authorization: "Basic " + btoa(`${id}:${secret}`) } : {};
}

// Introspect the presented token at the sandbox, as this source. Called on
// EVERY request and never cached, so a revoked grant stops the very next call.
// Fails closed: when the sandbox cannot be asked, refuses this source's own
// credentials, or answers anything but an introspection, nothing is served.
export async function introspect(request, env) {
  const origin = requireOrigin(env);
  const token = bearer(request);
  const unavailable = new Refusal(503, "introspection_unavailable",
    "the sandbox could not be asked about this token, so nothing is served");
  let res;
  try {
    res = await post(origin + "/v1/token/introspect", { token }, sourceCredentials(env));
  } catch (_) {
    throw unavailable;
  }
  // The sandbox refused the source itself, not the token: its client
  // credentials are missing or wrong. The caller's token was never looked up.
  if (res.status === 401 || res.status === 403) {
    throw new Refusal(503, "source_not_authorized",
      "the sandbox did not accept this source's own client credentials, so nothing is served");
  }
  let info;
  try {
    if (!res.ok) throw new Error("status " + res.status);
    info = await res.json();
  } catch (_) {
    throw unavailable;
  }
  if (!info || info.active !== true) {
    throw new Refusal(401, "invalid_token", "token inactive or unknown");
  }
  // Defence in depth: the sandbox already answers active:false past expiry.
  if (info.expires_at && Date.parse(info.expires_at) <= Date.now()) {
    throw new Refusal(401, "invalid_token", "token inactive or unknown");
  }
  // A resource server fails closed on any token_type it does not implement. A
  // user (session) token says who the caller is, not what may be read.
  if (info.token_type !== "access") {
    throw new Refusal(403, "wrong_token_type",
      "a data-access token is required (token_type \"access\")");
  }
  // Audience (RFC 8707; MCP authorization, "Token Audience Binding and
  // Validation"): a token issued for a named resource must name this one. The
  // identifier is the MCP endpoint for both faces: one resource server, two
  // faces, and the one identifier its metadata publishes as `resource`. A token
  // without `aud` (a /v1/token token) is accepted as before.
  if (info.aud !== undefined && info.aud !== null) {
    const resource = new URL(request.url).origin + MCP_RESOURCE_PATH;
    const audiences = Array.isArray(info.aud) ? info.aud : [info.aud];
    if (!audiences.includes(resource)) {
      throw new Refusal(401, "invalid_token", "the token was issued for another resource");
    }
  }
  if (typeof info.resource_owner !== "string" || !info.resource_owner.startsWith("did:")) {
    throw new Refusal(403, "wrong_subject", "the token names no resource owner");
  }
  return info;
}

// Enforce scope and subject for one read.
export function authorize(info, scope, owner) {
  if (!Object.hasOwn(SCOPES, scope)) {
    throw new Refusal(404, "unknown_scope", `unknown scope ${JSON.stringify(scope)}`);
  }
  if (info.scope !== scope) {
    throw new Refusal(403, "insufficient_scope",
      `the token covers scope ${JSON.stringify(info.scope)}, not ${JSON.stringify(scope)}`,
      { scope });
  }
  if (!owner) {
    throw new Refusal(400, "owner_required",
      "name whose data you are asking for: owner=<the resource owner's DID>");
  }
  if (owner !== info.resource_owner) {
    throw new Refusal(403, "wrong_subject",
      "the token does not authorize this owner's data");
  }
}

// Append the access to the owner's ledger at the sandbox. Only
// { subject_did, scope, purpose, accessor, consent_id } leaves this source:
// never a value. The consent id is the one introspection returned, so the
// ledger entry names the grant the read was made under; when introspection
// returned none, the field is left out rather than sent as null.
export async function recordAccess(info, env) {
  const origin = requireOrigin(env);
  const headers = sourceCredentials(env);
  const record = {
    subject_did: info.resource_owner,
    scope: info.scope,
    purpose: info.purpose || "",
    accessor: ACCESSOR,
  };
  if (typeof info.consent_id === "string" && info.consent_id) {
    record.consent_id = info.consent_id;
  }
  try {
    const res = await post(origin + "/v1/access/record", record, headers);
    if (!res.ok) throw new Error("status " + res.status);
    const body = await res.json();
    if (!body || body.recorded !== true) throw new Error("not recorded");
    return body.entry_hash || null;
  } catch (_) {
    throw new Refusal(503, "access_record_failed",
      "the access could not be written to the owner's ledger, so nothing is served");
  }
}

// --------------------------------------------------------------------------
// personas
// --------------------------------------------------------------------------

// The mapping, in full: SHA-256 of the DID's UTF-8 bytes, the first four bytes
// read as a big-endian unsigned integer, modulo the number of personas, indexes
// persona_ids in their published order.
export async function personaIndexFor(did) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(did)));
  const n = new DataView(digest.buffer).getUint32(0, false);
  return n % PERSONAS.persona_ids.length;
}

// One override, for tests: a grant whose purpose text carries `persona:<id>`
// pins that persona. The purpose is what the (synthetic) owner consented to and
// what the token was issued against, so the pin cannot be added per request.
export async function selectPersona(info) {
  const pin = PERSONA_PIN.exec(String(info.purpose || ""));
  if (pin && Object.hasOwn(PERSONAS.personas, pin[1])) {
    return { persona: PERSONAS.personas[pin[1]], selected_by: "purpose" };
  }
  const id = PERSONAS.persona_ids[await personaIndexFor(info.resource_owner)];
  return { persona: PERSONAS.personas[id], selected_by: "did-hash" };
}

function envelope(info, selection, entryHash, data) {
  return {
    fixture: true,
    notice: NOTICE,
    resource_owner: info.resource_owner,
    scope: info.scope,
    purpose: info.purpose ?? null,
    requester: info.requester ?? null,
    consent_id: info.consent_id ?? null,
    persona: {
      persona_id: selection.persona.persona_id,
      display_name: selection.persona.display_name,
      selected_by: selection.selected_by,
    },
    as_of: PERSONAS.as_of,
    access_recorded: true,
    ledger_entry_hash: entryHash,
    data,
  };
}

// --------------------------------------------------------------------------
// the handlers both faces call
// --------------------------------------------------------------------------

export async function listScopes(info) {
  const { persona, selected_by } = await selectPersona(info);
  return {
    fixture: true,
    notice: NOTICE,
    token: {
      scope: info.scope,
      resource_owner: info.resource_owner,
      purpose: info.purpose ?? null,
      expires_at: info.expires_at ?? null,
    },
    persona: { persona_id: persona.persona_id, display_name: persona.display_name, selected_by },
    scopes: Object.entries(SCOPES).map(([scope, description]) => ({
      scope,
      description,
      readable_with_this_token: scope === info.scope,
      covered: persona.scopes[scope].covered,
    })),
  };
}

export async function readScope(info, env, { scope, owner }) {
  authorize(info, scope, owner);
  const selection = await selectPersona(info);
  const entryHash = await recordAccess(info, env);
  return envelope(info, selection, entryHash, selection.persona.scopes[scope]);
}

export async function weeklySummary(info, env, { owner, week }) {
  authorize(info, WEEKLY_SUMMARY_SCOPE, owner);
  const selection = await selectPersona(info);
  const weeks = selection.persona.weeks;
  let chosen = weeks[weeks.length - 1];
  if (week !== undefined && week !== null && week !== "") {
    const index = Number(week);
    chosen = Number.isInteger(index) ? weeks.find((w) => w.week_index === index) : undefined;
    if (!chosen) {
      throw new Refusal(404, "unknown_week",
        `no such week; this persona has week_index 0 to ${weeks.length - 1}`);
    }
  }
  const entryHash = await recordAccess(info, env);
  return envelope(info, selection, entryHash, {
    headline: selection.persona.headline,
    focus: selection.persona.focus,
    week: chosen,
    weeks_available: weeks.map((w) => w.week_index),
  });
}

export function descriptor(env, url) {
  const base = url.origin + PREFIX;
  return {
    name: "LifeCare.ID® sandbox synthetic source",
    fixture: true,
    notice: NOTICE,
    version: VERSION,
    configured: sandboxOrigin(env) !== null,
    // Whether the source presents its own client credentials to the sandbox
    // (never the credentials themselves). Introspection needs them.
    client_credentials: Object.keys(sourceCredentials(env)).length > 0,
    authorization_server: sandboxOrigin(env),
    docs: RESOURCE_DOCUMENTATION,
    as_of: PERSONAS.as_of,
    persona_ids: PERSONAS.persona_ids,
    persona_mapping:
      "sha256(resource owner DID), first four bytes big-endian, modulo the number of personas; " +
      "a grant purpose carrying persona:<id> pins one instead",
    scopes: SCOPES,
    rest: {
      scopes: `GET ${base}/v1/scopes`,
      read: `GET ${base}/v1/source/{scope}?owner={did}`,
      weekly_summary: `GET ${base}/v1/weekly-summary?owner={did}&week={week_index}`,
    },
    mcp: {
      endpoint: `${base}/mcp`,
      resource_metadata: resourceMetadataUrl(url.origin),
      transport: "streamable HTTP, stateless, JSON responses",
      tools: TOOLS.map((t) => t.name),
      label: "Test fixture for agent governance pilots. Not the member MCP surface.",
    },
    auth: "Authorization: Bearer <sandbox data-access token>, introspected on every request",
  };
}

// --------------------------------------------------------------------------
// REST face
// --------------------------------------------------------------------------

async function rest(request, env, url, path) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(405, { detail: "method not allowed", error: "method_not_allowed" },
      { allow: "GET, HEAD, OPTIONS" });
  }
  if (path === "" || path === "/") return json(200, descriptor(env, url));

  const owner = url.searchParams.get("owner") || "";
  if (path === "/v1/scopes") {
    return json(200, await listScopes(await introspect(request, env)));
  }
  if (path === "/v1/weekly-summary") {
    const info = await introspect(request, env);
    return json(200, await weeklySummary(info, env, { owner, week: url.searchParams.get("week") }));
  }
  const read = /^\/v1\/source\/([^/]+)$/.exec(path);
  if (read) {
    const info = await introspect(request, env);
    return json(200, await readScope(info, env, { scope: decodeURIComponent(read[1]), owner }));
  }
  return json(404, { detail: "not found", error: "not_found" });
}

// --------------------------------------------------------------------------
// MCP face (streamable HTTP, stateless, JSON responses)
// --------------------------------------------------------------------------

const OWNER_PROPERTY = {
  type: "string",
  description:
    "The resource owner's DID. It must be the owner the token was issued for; list_scopes returns it.",
};

export const TOOLS = [
  {
    name: "list_scopes",
    title: "List scopes (sandbox test fixture)",
    description:
      "TEST FIXTURE, synthetic personas only. Lists the scope vocabulary, which scope the presented " +
      "token can read, the resource owner it was issued for and the synthetic persona behind it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "read_scope",
    title: "Read one scope (sandbox test fixture)",
    description:
      "TEST FIXTURE, synthetic personas only. Reads one scope of interpreted outputs (bands, scores, " +
      "directions, dates, sentences) for the token's resource owner. The token must cover exactly this " +
      "scope. Every successful read is written to the owner's consent ledger.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: Object.keys(SCOPES), description: "The scope to read." },
        owner: OWNER_PROPERTY,
      },
      required: ["scope", "owner"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_weekly_summary",
    title: "Get a weekly summary (sandbox test fixture)",
    description:
      "TEST FIXTURE, synthetic personas only. One week's pillar bands, directions and an authored " +
      "sentence, plus the persona's headline. Needs a token for the `daily` scope. Omit `week` for the " +
      "latest week. Every successful read is written to the owner's consent ledger.",
    inputSchema: {
      type: "object",
      properties: {
        owner: OWNER_PROPERTY,
        week: { type: "integer", minimum: 0, description: "week_index, from 0. Omit for the latest." },
      },
      required: ["owner"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];

function rpcResult(id, result) {
  // Every result carries `resultType` (required by the 2026-07-28 schema on the
  // base Result; a legacy client ignores the extra field). Found 2026-10-27: a
  // new-SDK gateway validates every result against the era it negotiated.
  return { jsonrpc: "2.0", id, result: { resultType: "complete", ...result } };
}
// The list results of 2026-07-28 also require a cache lifetime and scope.
const CACHEABLE = { ttlMs: 300000, cacheScope: "public" };

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError,
  };
}

// `transport`: true only for a single (non-batch) tools/call. A wrong-scope
// call is then not a tool result but an authorization error, so the refusal is
// rethrown and handleRequest answers it at the transport: HTTP 403 with
// `WWW-Authenticate: Bearer error="insufficient_scope", scope="<asked>",
// resource_metadata="..."` (MCP authorization 2026-07-28, "Runtime Insufficient
// Scope Errors"; RFC 6750 section 3.1). A client that follows the specification
// re-runs authorization for the scope named. Only insufficient_scope moves:
// wrong_subject, unknown_scope, owner_required and every other refusal stay
// tool errors (they are not something the person can be asked to widen). Inside
// a JSON-RPC batch one HTTP status cannot speak for several requests, so a batch
// keeps the in-band tool error for that element (transport false). Nothing is
// recorded for a refused call: the scope check runs before recordAccess.
async function callTool(info, env, params, { transport = false } = {}) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  try {
    if (name === "list_scopes") return toolResult(await listScopes(info));
    if (name === "read_scope") {
      return toolResult(await readScope(info, env, { scope: String(args.scope ?? ""), owner: String(args.owner ?? "") }));
    }
    if (name === "get_weekly_summary") {
      return toolResult(await weeklySummary(info, env, { owner: String(args.owner ?? ""), week: args.week }));
    }
  } catch (e) {
    if (e instanceof Refusal) {
      if (transport && e.error === "insufficient_scope" && e.scope) throw e;
      return toolResult({ ...e.body(), status: e.status }, true);
    }
    throw e;
  }
  return null; // unknown tool
}

// `single`: the message is the whole request body, not an element of a batch.
async function rpc(message, info, env, { single = false } = {}) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message && message.id, -32600, "invalid request");
  }
  const { id, method, params } = message;
  if (id === undefined || id === null) return null; // a notification: nothing to answer
  if (method === "initialize") {
    const asked = params && params.protocolVersion;
    return rpcResult(id, {
      protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_DEFAULT_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: "lifecare-sandbox-source",
        title: "LifeCare.ID® sandbox synthetic source (test fixture)",
        version: VERSION,
      },
      instructions:
        NOTICE + " Call list_scopes first: it names the resource owner and the one scope this " +
        "token can read. Tokens are single scope. This is not the member MCP surface.",
    });
  }
  if (method === "server/discover") {
    // 2026-07-28 discovery: a client that speaks the modern era asks this before
    // anything else and falls back to `initialize` only on an HTTP 400 with an
    // unrecognised body. Answering it keeps gateways on the new SDK (a gateway
    // firewall, 2026-10-27) from reporting "method not found" on every call.
    return rpcResult(id, {
      resultType: "complete",
      supportedVersions: MCP_MODERN_VERSIONS,
      // Both required by the 2026-07-28 schema (DiscoverResult): a client's
      // validation fails without them (a gateway firewall, 2026-10-27, second
      // round). Public, because discovery carries no user-specific data.
      ttlMs: 300000,
      cacheScope: "public",
      capabilities: { tools: { listChanged: false } },
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "lifecare-sandbox-source",
          title: "LifeCare.ID® sandbox synthetic source (test fixture)",
          version: VERSION,
        },
      },
      instructions:
        NOTICE + " Call list_scopes first: it names the resource owner and the one scope this " +
        "token can read. Tokens are single scope. This is not the member MCP surface.",
    });
  }
  if (method === "ping") return rpcResult(id, {});
  // Optional capability lists this server does not offer. A gateway that asks for
  // them (a gateway firewall does, after initialize) must get an empty list, not
  // -32601: found 2026-10-27, when "method not found" on prompts/list failed every
  // tools/call through the firewall although tools/list had worked.
  if (method === "resources/list") return rpcResult(id, { resources: [], ...CACHEABLE });
  if (method === "resources/templates/list") return rpcResult(id, { resourceTemplates: [], ...CACHEABLE });
  if (method === "prompts/list") return rpcResult(id, { prompts: [], ...CACHEABLE });
  if (method === "logging/setLevel") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS, ...CACHEABLE });
  if (method === "tools/call") {
    const result = await callTool(info, env, params, { transport: single });
    return result ? rpcResult(id, result) : rpcError(id, -32602, "unknown tool");
  }
  return rpcError(id, -32601, "method not found");
}

async function mcp(request, env) {
  if (request.method !== "POST") {
    // No server-initiated stream and no session to delete: POST only.
    return json(405, { detail: "this MCP endpoint answers POST only", error: "method_not_allowed" },
      { allow: "POST, OPTIONS" });
  }
  // The transport is authorized before anything is parsed: every MCP message,
  // initialize and tools/list included, needs an active sandbox access token.
  const info = await introspect(request, env);
  let message;
  try {
    message = await request.json();
  } catch (_) {
    return json(400, rpcError(null, -32700, "parse error"));
  }
  if (Array.isArray(message)) {
    const answers = (await Promise.all(message.map((m) => rpc(m, info, env)))).filter(Boolean);
    return answers.length ? json(200, answers) : new Response(null, { status: 202, headers: CORS });
  }
  const answer = await rpc(message, info, env, { single: true });
  return answer ? json(200, answer) : new Response(null, { status: 202, headers: CORS });
}

// --------------------------------------------------------------------------
// entry point
// --------------------------------------------------------------------------

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) {
    return json(404, { detail: "not found", error: "not_found" });
  }
  const path = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // The resource identifier is /sandbox-source/mcp with no slash. A slashed
  // request would be challenged with a metadata URL whose `resource` does not
  // match the URL requested (RFC 9728 section 3.3), so send it to the canonical
  // path. 308 keeps the method and body of a POST.
  if (path === "/mcp" && url.pathname.endsWith("/")) {
    return new Response(null, {
      status: 308, headers: { ...CORS, location: url.origin + MCP_RESOURCE_PATH + url.search },
    });
  }
  try {
    if (path === "/mcp") return await mcp(request, env);
    return await rest(request, env, url, path);
  } catch (e) {
    if (e instanceof Refusal) {
      // Only the MCP path is the resource the metadata document describes.
      return e.response(path === "/mcp" ? { resourceMetadata: resourceMetadataUrl(url.origin) } : {});
    }
    return json(500, { detail: "internal error", error: "internal_error" });
  }
}

// --------------------------------------------------------------------------
// OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint
// --------------------------------------------------------------------------

export const MCP_RESOURCE_PATH = PREFIX + "/mcp";
export const WELL_KNOWN_PRM = "/.well-known/oauth-protected-resource";
export const RESOURCE_DOCUMENTATION = "https://developers.lifecare.id/sandbox-data-source";

// RFC 9728 section 3.1: the well-known segment goes between the host and the
// resource's path. For https://lifecare.id/sandbox-source/mcp that is
// https://lifecare.id/.well-known/oauth-protected-resource/sandbox-source/mcp.
export function resourceMetadataUrl(origin) {
  return origin + WELL_KNOWN_PRM + MCP_RESOURCE_PATH;
}

// Mounted by functions/.well-known/oauth-protected-resource/[[path]].js.
//
// Only the path form answers 200. The root form
// (/.well-known/oauth-protected-resource) is a 404: by RFC 9728 section 3 it
// names the metadata of a resource whose identifier is the bare origin, and
// section 3.3 forbids a client to use a document whose `resource` differs from
// the identifier it built the URL from. Our resource is the MCP endpoint, not
// the origin. A client that follows the 401 challenge never needs the root
// form, and one that probes tries the path form first (MCP authorization,
// "Protected Resource Metadata Discovery Requirements").
//
// `resource` and the URLs are derived from the request's own origin, so a
// Pages preview deployment names itself; in production that origin is
// https://lifecare.id. `authorization_servers` is the sandbox issuer from the
// Pages project variable LIFECAREID_SANDBOX_ORIGIN; unset, the answer is 503,
// as for the data routes, because there is no authorization server to name.
export async function handleProtectedResourceMetadata(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(405, { detail: "method not allowed", error: "method_not_allowed" },
      { allow: "GET, HEAD, OPTIONS" });
  }
  const url = new URL(request.url);
  if (!url.pathname.startsWith(WELL_KNOWN_PRM)) {
    return json(404, { detail: "not found", error: "not_found" });
  }
  const rest = url.pathname.slice(WELL_KNOWN_PRM.length).replace(/\/+$/, "");
  if (rest !== MCP_RESOURCE_PATH) {
    return json(404, { detail: "not found", error: "not_found" });
  }
  const issuer = sandboxOrigin(env);
  if (!issuer) {
    return new Refusal(503, "source_not_configured",
      "the source has no sandbox to name as its authorization server (LIFECAREID_SANDBOX_ORIGIN is unset)").response();
  }
  return json(200, {
    resource: url.origin + MCP_RESOURCE_PATH,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: Object.keys(SCOPES),
    resource_documentation: RESOURCE_DOCUMENTATION,
  }, { "cache-control": "public, max-age=300" });
}
