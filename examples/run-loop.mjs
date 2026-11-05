#!/usr/bin/env node
// The whole loop against a LifeCare.ID® sandbox, in one run: read the source's
// challenge and follow it to the sandbox (OAuth protected resource metadata,
// RFC 9728), register a client, mint a synthetic person, grant two scopes, get a token for one
// through the authorization code flow (PKCE, the person's yes, POST /token), read over
// REST and over MCP, provoke the refusal for a scope that was not granted, see
// the read in the person's ledger, revoke, and watch the next read fail on both
// faces, with the error the challenge names. Then delete the client.
//
// Hosted:  LIFECAREID_DEVACCESS_TOKEN=... node examples/run-loop.mjs
//          (the token from https://app.lifecare.id/devaccess)
// Local source (compose/), hosted sandbox:
//          LIFECAREID_DEVACCESS_TOKEN=... SOURCE=http://localhost:8799/sandbox-source \
//          node examples/run-loop.mjs
//
// The developer access token goes only to https://sandbox.lifecare.id (the
// default) or to the SANDBOX you set, never to a server a source's metadata
// names. The run discovers the issuer the source names and checks it: when it
// agrees with the sandbox in use the run goes on; when it differs and SANDBOX is
// not set, the run stops before it sends anything; when it differs and SANDBOX
// is set, the run says so and keeps yours.
//
// Prints statuses, the persona and the ledger line. It never prints a secret:
// not the developer access token, not the client secret, not the session, not
// the data-access token. Exit code 0 when every step answered as the contract
// says, 1 otherwise. Node 22 or newer, no dependencies.
import crypto from "node:crypto";

const SANDBOX_GIVEN = (process.env.SANDBOX || "").replace(/\/+$/, "");
const SANDBOX = SANDBOX_GIVEN || "https://sandbox.lifecare.id";
const SOURCE = (process.env.SOURCE || "https://lifecare.id/sandbox-source").replace(/\/+$/, "");
const DEVACCESS = process.env.LIFECAREID_DEVACCESS_TOKEN || "";
// Add " persona:<id>" (for example persona:p5-glucose-anomaly) to pin a persona.
const PURPOSE = process.env.PURPOSE || "agent governance pilot";
const SCOPE = "recovery";

async function call(method, url, { bearer, basic, cookie, body } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (bearer) headers.authorization = "Bearer " + bearer;
  if (basic) headers.authorization = "Basic " + Buffer.from(basic).toString("base64");
  if (cookie) headers.cookie = cookie;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
  return { status: res.status, json, headers: res.headers };
}

let failed = false;
function report(step, res, want, note = "") {
  const ok = res.status === want;
  if (!ok) failed = true;
  const detail = ok ? note : `expected ${want}; ${res.json?.detail ?? res.json?.error?.message ?? ""}`;
  console.log(`${ok ? "ok  " : "FAIL"} ${step}: ${res.status}${detail ? "  " + detail : ""}`);
  return ok;
}

// The parameters of a Bearer challenge (RFC 6750 section 3, RFC 9728 section 5.1):
// resource_metadata="...", error="...". Values only, never a token.
function challengeParams(res) {
  const header = res.headers.get("www-authenticate") || "";
  return Object.fromEntries([...header.matchAll(/([a-z_]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

const mcpCall = (name, args) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

console.log(`source  ${SOURCE}\n`);

// 0. discovery: ask the MCP endpoint with no token, read the challenge, fetch the
//    protected resource metadata it names, and check the sandbox it names against
//    the one this run will use. A client that follows the MCP authorization
//    specification takes this path from the endpoint to the sandbox; this one
//    checks the answer and never sends the developer access token to a server it
//    was not told about.
const unauthenticated = await call("POST", `${SOURCE}/mcp`, {
  body: { jsonrpc: "2.0", id: 0, method: "tools/list" },
});
const metadataUrl = challengeParams(unauthenticated).resource_metadata;
report("MCP request without a token", unauthenticated, 401,
  metadataUrl ? "challenge names " + metadataUrl : "");
if (unauthenticated.status === 401 && !metadataUrl) {
  failed = true;
  console.log("FAIL the challenge carries no resource_metadata");
}
if (metadataUrl) {
  const metadata = await call("GET", metadataUrl);
  report("protected resource metadata", metadata, 200,
    `resource ${metadata.json?.resource}, scopes ${(metadata.json?.scopes_supported ?? []).length}`);
  const resourceOk = metadata.json?.resource === `${SOURCE}/mcp`;
  if (metadata.status === 200 && !resourceOk) {
    failed = true;
    console.log(`FAIL the document's resource is not the endpoint called (${SOURCE}/mcp)`);
  } else if (resourceOk) {
    console.log("ok   resource matches the endpoint called");
  }
  const discovered = (metadata.json?.authorization_servers?.[0] || "").replace(/\/+$/, "");
  if (!discovered) {
    failed = true;
    console.log("FAIL the metadata names no authorization server");
  } else if (discovered === SANDBOX) {
    console.log(`ok   sandbox ${SANDBOX} (${SANDBOX_GIVEN ? "given" : "default"}; the metadata agrees)`);
  } else if (!SANDBOX_GIVEN) {
    console.log(`FAIL the source names sandbox ${discovered}; this run sends your developer access token only to ${SANDBOX} or to SANDBOX. Set SANDBOX=${discovered} if you trust it`);
    process.exit(1);
  } else {
    console.log(`note sandbox ${SANDBOX} (given; the metadata names ${discovered}, kept the one given)`);
  }
} else {
  console.log(`note sandbox ${SANDBOX} (no metadata to follow)`);
}
console.log("");

// 1. register a client (the hosted sandbox needs the developer access token)
const REDIRECT = "http://localhost:4000/callback";
const RESOURCE = `${SOURCE}/mcp`;   // the token's audience (RFC 8707); registered on the client below
const registered = await call("POST", `${SANDBOX}/v1/sandbox/clients`, {
  bearer: DEVACCESS || undefined,
  body: { name: "Sandbox kit loop", redirect_uris: [REDIRECT], resources: [RESOURCE] },
});
if (!report("register a client", registered, 200, "client_id " + (registered.json?.client_id ?? ""))) {
  if (registered.status === 401 && !DEVACCESS) {
    console.log("     the hosted sandbox needs LIFECAREID_DEVACCESS_TOKEN (https://app.lifecare.id/devaccess)");
  }
  process.exit(1);
}
const { client_id: clientId, client_secret: clientSecret } = registered.json;

// 2. mint a synthetic person
const minted = await call("POST", `${SANDBOX}/v1/sandbox/test-identity`, { bearer: DEVACCESS || undefined, body: {} });
if (!report("mint a synthetic identity", minted, 200, minted.json?.did ?? "")) process.exit(1);
const { did, session_token: session } = minted.json;

// 3. the person grants the client the scope (the code flow below reuses this grant:
//    one scope, the same purpose)
const granted = await call("POST", `${SANDBOX}/v1/consent/grant`, {
  bearer: session,
  body: { subject_did: did, grantee: { name: "Sandbox kit loop", id: clientId },
    scopes: [SCOPE], purpose: { text: PURPOSE }, duration_days: 1 },
});
if (!report("grant recovery", granted, 200, granted.json?.consent_id ?? "")) process.exit(1);
const consentId = granted.json.consent_id;

// 4. a token for one scope, from the authorization code flow, as an app gets it in
//    production (POST /v1/token with a session is issued only against the person's
//    own grant). The person's yes is given with the synthetic session cookie.
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const verifier = b64url(crypto.randomBytes(48));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = b64url(crypto.randomBytes(12));
const cookie = `${SANDBOX.startsWith("https:") ? "__Host-" : ""}lc_id_session=${session}`;
const authorizeUrl = `${SANDBOX}/authorize?` + new URLSearchParams({
  response_type: "code", client_id: clientId, redirect_uri: REDIRECT, state,
  code_challenge: challenge, code_challenge_method: "S256", scope: SCOPE, resource: RESOURCE, purpose: PURPOSE,
});
const question = await fetch(authorizeUrl, { headers: { cookie }, redirect: "manual" });
const questionHtml = await question.text();
const action = questionHtml.match(/<form method="post" action="([^"]+)"/)?.[1];
let issued = { status: question.status, json: null };
if (question.status === 200 && action) {
  const form = new URLSearchParams();
  for (const m of questionHtml.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) {
    form.set(m[1], m[2].replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  form.set("decision", "approve");
  const decided = await fetch(new URL(action, SANDBOX), {
    method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: form, redirect: "manual",
  });
  const code = new URL(decided.headers.get("location") || "http://x/").searchParams.get("code");
  if (decided.status === 303 && code) {
    issued = await call("POST", `${SANDBOX}/token`, { body: {
      grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier,
      resource: RESOURCE, client_id: clientId, client_secret: clientSecret } });
  } else {
    issued = { status: decided.status, json: { detail: "the yes was not accepted" } };
  }
}
if (!report(`token for ${SCOPE} (code flow)`, issued, 200, "expires_in " + (issued.json?.expires_in ?? ""))) process.exit(1);
const token = issued.json.access_token;
// the grant the yes made: read its id from introspection, to revoke it below
const info = await call("POST", `${SANDBOX}/v1/token/introspect`, { basic: `${clientId}:${clientSecret}`, body: { token } });
report("introspect the token", info, 200, `consent_id ${info.json?.consent_id ?? "(none)"}`);
const codeFlowConsentId = info.json?.consent_id ?? consentId;

// 5. read over REST
const readUrl = `${SOURCE}/v1/source/${SCOPE}?owner=${encodeURIComponent(did)}`;
const rest = await call("GET", readUrl, { bearer: token });
report("REST read", rest, 200,
  `persona ${rest.json?.persona?.persona_id} (${rest.json?.persona?.selected_by}), band ${rest.json?.data?.band}, recorded ${rest.json?.access_recorded}`);

// 6. a scope the token does not cover: refused, nothing recorded
const wrongScope = await call("GET", `${SOURCE}/v1/source/cgm?owner=${encodeURIComponent(did)}`, { bearer: token });
report("REST read of an ungranted scope", wrongScope, 403, wrongScope.json?.error ?? "");

// 7. read over MCP
const mcp = await call("POST", `${SOURCE}/mcp`, { bearer: token, body: mcpCall("read_scope", { scope: SCOPE, owner: did }) });
const mcpResult = mcp.json?.result;
report("MCP read_scope", mcp, 200,
  mcpResult ? `isError ${mcpResult.isError}, same persona ${mcpResult.structuredContent?.persona?.persona_id === rest.json?.persona?.persona_id}` : "no result");

// 8. the person's ledger shows the reads
const ledger = await call("GET", `${SANDBOX}/v1/consent/ledger/${encodeURIComponent(did)}`, { bearer: session });
const entries = Array.isArray(ledger.json?.entries) ? ledger.json.entries : [];
const accesses = entries.filter((e) => e.event_type === "data_access");
report("ledger", ledger, 200,
  `${entries.length} entries, ${accesses.length} data accesses, chain valid ${ledger.json?.chain_valid}`);
if (ledger.status === 200 && accesses.length === 0) { failed = true; console.log("FAIL the reads are not in the ledger"); }
if (accesses.length) console.log(`     latest: ${accesses.at(-1).description}`);

// 9. revoke
const revoked = await call("POST", `${SANDBOX}/v1/consent/revoke`, { bearer: session, body: { consent_id: codeFlowConsentId } });
report("revoke the grant", revoked, 200);

// 10. the same token, refused on both faces
const replayRest = await call("GET", readUrl, { bearer: token });
report("REST read after revocation", replayRest, 401,
  `${replayRest.json?.error ?? ""}, challenge error ${challengeParams(replayRest).error ?? "(none)"}`);
const replayMcp = await call("POST", `${SOURCE}/mcp`, { bearer: token, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
report("MCP tools/list after revocation", replayMcp, 401,
  `${replayMcp.json?.error ?? ""}, challenge error ${challengeParams(replayMcp).error ?? "(none)"}`);

// 11. delete the client with its own secret (the hosted sandbox wants the
//     developer access token as the lc_dev cookie here, since the header
//     carries the client credential)
const deleted = await call("DELETE", `${SANDBOX}/v1/sandbox/clients/${encodeURIComponent(clientId)}`, {
  basic: `${clientId}:${clientSecret}`, cookie: DEVACCESS ? `lc_dev=${DEVACCESS}` : undefined,
});
report("delete the client", deleted, 200);

console.log(failed ? "\nsome step did not answer as the contract says" : "\nthe loop closed as the contract says");
process.exit(failed ? 1 : 0);
