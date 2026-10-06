#!/usr/bin/env node
// The whole loop against a LifeCare.ID® sandbox, in one run: register a client,
// mint a synthetic person, grant two scopes, get a token for one, read over
// REST and over MCP, provoke the refusal for a scope that was not granted, see
// the read in the person's ledger, revoke, and watch the next read fail on both
// faces. Then delete the client.
//
// Hosted:  LIFECAREID_DEVACCESS_TOKEN=... node examples/run-loop.mjs
//          (the token from https://app.lifecare.id/devaccess)
// Local:   SANDBOX=http://localhost:8821 SOURCE=http://localhost:8799/sandbox-source \
//          node examples/run-loop.mjs
//
// Prints statuses, the persona and the ledger line. It never prints a secret:
// not the developer access token, not the client secret, not the session, not
// the data-access token. Exit code 0 when every step answered as the contract
// says, 1 otherwise. Node 22 or newer, no dependencies.
const SANDBOX = (process.env.SANDBOX || "https://sandbox.lifecare.id").replace(/\/+$/, "");
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

const mcpCall = (name, args) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

console.log(`sandbox ${SANDBOX}\nsource  ${SOURCE}\n`);

// 1. register a client (the hosted sandbox needs the developer access token)
const registered = await call("POST", `${SANDBOX}/v1/sandbox/clients`, {
  bearer: DEVACCESS || undefined,
  body: { name: "Sandbox kit loop", redirect_uris: ["http://localhost:4000/callback"] },
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

// 3. the person grants the client two scopes
const granted = await call("POST", `${SANDBOX}/v1/consent/grant`, {
  bearer: session,
  body: { subject_did: did, grantee: { name: "Sandbox kit loop", id: clientId },
    scopes: [SCOPE, "daily"], purpose: { text: PURPOSE }, duration_days: 1 },
});
if (!report("grant recovery and daily", granted, 200, granted.json?.consent_id ?? "")) process.exit(1);
const consentId = granted.json.consent_id;

// 4. a token for one scope
const issued = await call("POST", `${SANDBOX}/v1/token`, {
  bearer: session, body: { subject_did: did, scope: SCOPE, purpose: PURPOSE, requester: clientId },
});
if (!report(`token for ${SCOPE}`, issued, 200, "expires " + (issued.json?.expires_at ?? ""))) process.exit(1);
const token = issued.json.access_token;

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
const revoked = await call("POST", `${SANDBOX}/v1/consent/revoke`, { bearer: session, body: { consent_id: consentId } });
report("revoke the grant", revoked, 200);

// 10. the same token, refused on both faces
const replayRest = await call("GET", readUrl, { bearer: token });
report("REST read after revocation", replayRest, 401, replayRest.json?.error ?? "");
const replayMcp = await call("POST", `${SOURCE}/mcp`, { bearer: token, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
report("MCP tools/list after revocation", replayMcp, 401, replayMcp.json?.error ?? "");

// 11. delete the client with its own secret (the hosted sandbox wants the
//     developer access token as the lc_dev cookie here, since the header
//     carries the client credential)
const deleted = await call("DELETE", `${SANDBOX}/v1/sandbox/clients/${encodeURIComponent(clientId)}`, {
  basic: `${clientId}:${clientSecret}`, cookie: DEVACCESS ? `lc_dev=${DEVACCESS}` : undefined,
});
report("delete the client", deleted, 200);

console.log(failed ? "\nsome step did not answer as the contract says" : "\nthe loop closed as the contract says");
process.exit(failed ? 1 : 0);
