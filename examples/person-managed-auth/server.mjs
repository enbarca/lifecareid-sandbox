#!/usr/bin/env node
// Server half, end to end, with the hosted sandbox as the authorization
// server (person-managed authorization, draft 1).
//
//   LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/server.mjs
//
// This process runs a small MCP server on your machine that holds one
// synthetic fact about a person and serves it through the server half of the
// library, then walks a caller through it: the 401 and the metadata that lead
// to the sandbox, a read under a grant, the 403 step-up for another scope, the
// receipt in the person's ledger, the person's revoke, and the refusal at the
// very next request.
//
// Why the grant is made through the sandbox's API here and not through the
// authorization code flow: the hosted sandbox issues authorization-code tokens
// only for the resources it lists, and a server on your machine is not one of
// them. The API path (steps 3 and 4 of the sandbox guide) gives the same kind
// of single-scope data-access token, for a client of your choosing, without an
// audience; the server accepts that, as the sandbox source does. The ceremony
// itself, on the LifeCare.ID® origin, is the client example's
// (examples/person-managed-auth/agent.mjs), against the hosted source.
//
// It registers two sandbox clients (this server's and the caller's) and a
// synthetic person at run time, and deletes both clients at the end. It prints
// no secret.
import http from "node:http";

import { nodeHandler } from "../../lib/person-managed-auth/src/node.js";
import { createResourceServer } from "../../lib/person-managed-auth/src/server.js";
import { challengeParams } from "../../lib/person-managed-auth/src/shared.js";
import {
  SANDBOX, cut, deleteClient, grantAndToken, hasFailed, liveGrantsTo, mintPerson, newestReadInLedger, ok, readsInLedger, registerClient,
  revokeGrant, say, step,
} from "./sandbox.mjs";
import { syntheticMcp } from "./synthetic-mcp.mjs";

const serverClient = await registerClient("Person-managed authorization example server");
const callerClient = await registerClient("Person-managed authorization example caller");
const person = await mintPerson();
ok(true, `registered the server's client ${serverClient.id} and the caller's ${callerClient.id}; synthetic person ${person.did}`);

let listener;
try {
  // ---- the server, in the builder's own process ---------------------------
  let pma;
  listener = http.createServer((req, res) => nodeHandler(pma, syntheticMcp(pma), { raw: true })(req, res));
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;
  pma = createResourceServer({
    resource: base + "/mcp",                      // the identifier of this resource
    authorizationServer: SANDBOX,                 // whose tokens it accepts
    clientId: serverClient.id,                    // this server's own registered client
    clientSecret: serverClient.secret,            //   (goes only to the authorization server's origin)
    scopes: ["daily", "cgm", "recovery"],
    scope: "daily",                               // the one scope a 401 suggests
    grantees: [callerClient.id],                  // who may hold a token for this server
    accessor: "person-managed-authorization-example",
  });
  say(`server    ${pma.resource}`);
  say(`issuer    ${pma.issuer}`);

  const rpc = (token, method, params, id = 1) =>
    fetch(pma.resource, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  const readScope = (token, scope) => rpc(token, "tools/call", { name: "read_scope", arguments: { scope } });

  step("1. discovery: a request with no token gets the challenge, and the challenge leads to the authorization server");
  const bare = await rpc(null, "tools/list");
  const challenge = bare.headers.get("www-authenticate");
  say(`     POST ${pma.resource} -> ${bare.status}`);
  say(`     WWW-Authenticate: ${challenge}`);
  const params = challengeParams(challenge);
  ok(bare.status === 401 && params.resource_metadata === pma.metadataUrl && params.scope === "daily", "401 names the metadata and the one scope it suggests");
  const prm = await (await fetch(params.resource_metadata)).json();
  say(`     GET ${params.resource_metadata} -> resource ${prm.resource}, authorization_servers ${JSON.stringify(prm.authorization_servers)}`);
  ok(prm.authorization_servers[0] === SANDBOX && prm.resource === pma.resource, "the metadata names this resource and the sandbox");

  step("2. the person grants the caller one scope (the sandbox's API path; see the note at the top)");
  const { consentId, token } = await grantAndToken(person, callerClient, { scope: "daily", purpose: "person-managed authorization server example" });
  ok(true, `grant ${cut(consentId.split(":").at(-1))}; token ${cut(token)} for scope daily`);

  step("3. a read under the grant: the server asks the sandbox about the token, writes the ledger line, then answers with the receipt");
  const init = await rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "example-caller", version: "0" } });
  ok(init.status === 200, `initialize -> ${init.status} (authorized, not a read)`);
  const r1 = await readScope(token, "daily");
  const body1 = (await r1.json()).result?.structuredContent ?? {};
  ok(r1.status === 200 && body1.access_recorded === true, `read_scope(daily) -> ${r1.status}, recorded ${body1.access_recorded}`);
  say(`     receipt: consent_id ${cut(body1.consent_id?.split(":").at(-1))}  ledger_entry_hash ${cut(body1.ledger_entry_hash)}`);
  ok(body1.consent_id === consentId, "the receipt names the grant the token was issued under");
  const line = await newestReadInLedger(person);
  say(`     the person's ledger: ${line?.description ?? "(none)"}`);
  ok(line?.description?.includes("person-managed-authorization-example"), "the person's ledger names this server as the reader");

  step("4. a read of a scope the token does not cover is refused on that one call, with the step-up header, and writes nothing");
  const readsBefore = (await readsInLedger(person)).length;
  const r2 = await readScope(token, "cgm");
  say(`     read_scope(cgm) -> ${r2.status}`);
  say(`     WWW-Authenticate: ${r2.headers.get("www-authenticate")}`);
  const p2 = challengeParams(r2.headers.get("www-authenticate"));
  ok(r2.status === 403 && p2.error === "insufficient_scope" && p2.scope === "cgm" && Boolean(p2.resource_metadata), "403 insufficient_scope names cgm and the metadata");
  ok((await readsInLedger(person)).length === readsBefore, "nothing was written to the person's ledger for the refused call");

  step("5. a token this server does not accept: wrong grantee");
  const stranger = await registerClient("Person-managed authorization example stranger");
  try {
    const other = await grantAndToken(person, stranger, { scope: "daily", purpose: "person-managed authorization server example stranger" });
    const r3 = await readScope(other.token, "daily");
    ok(r3.status === 403, `a token issued to another client -> ${r3.status} ${(await r3.json()).error}`);
    await revokeGrant(person, other.consentId);
  } finally {
    await deleteClient(stranger);
  }

  step("6. the person revokes in the data-rights panel (its API)");
  const grants = await liveGrantsTo(person, callerClient.id);
  for (const g of grants) {
    const r = await revokeGrant(person, g.consent_id);
    ok(r.status === 200, `revoke ${cut(g.consent_id.split(":").at(-1))}: ${r.status}, tokens invalidated ${r.tokens_invalidated}`);
  }

  step("7. the very next request is refused: nothing was cached");
  const r4 = await readScope(token, "daily");
  say(`     read_scope(daily) -> ${r4.status}`);
  say(`     WWW-Authenticate: ${r4.headers.get("www-authenticate")}`);
  ok(r4.status === 401 && challengeParams(r4.headers.get("www-authenticate")).error === "invalid_token", "401 invalid_token at the next request");
  const r5 = await rpc(token, "tools/list");
  ok(r5.status === 401, `and every other message too (tools/list -> ${r5.status})`);
} catch (e) {
  ok(false, `${e?.name ?? "Error"}: ${e?.message ?? e}`);
} finally {
  step("8. clean up");
  listener?.closeAllConnections?.();
  listener?.close();
  await deleteClient(serverClient);
  await deleteClient(callerClient);
}

say(hasFailed() ? "\nsome step did not answer as expected" : "\nthe loop closed: challenged, led to the sandbox, read, receipted, stepped up, stopped");
process.exit(hasFailed() ? 1 : 0);
