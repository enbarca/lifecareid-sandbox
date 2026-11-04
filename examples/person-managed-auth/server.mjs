#!/usr/bin/env node
// Server half, end to end, with the hosted sandbox as the authorization
// server (person-managed authorization, draft 1).
//
//   LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/server.mjs
//
// This process runs a small MCP server on your machine that holds one
// synthetic fact about a person and serves it through the server half of the
// library, then walks a caller through it the way a real agent would: the 401
// and the metadata that lead to the sandbox, the authorization code flow with
// this server as the resource, a read under the grant, the step-up for another
// scope, the receipt in the person's ledger, the person's revoke, and the
// refusal at the very next request.
//
// How a server on your machine takes part in the flow: the sandbox accepts the
// resource of an /authorize request when a client of yours registered it
// (sandbox 0.27.0 and later; `resources` on POST /v1/sandbox/clients). So this
// process listens first, works out the resource string exactly as the library
// compares it (pma.resource), and registers that string on its own client. The
// caller is a different client, registered under the same developer access
// token, and the token it gets has this server's loopback URL as its `aud`.
// There is no fallback to the sandbox's API path (steps 3 and 4 of the sandbox
// guide) for a sandbox older than 0.27.0: that refuses the registered resource
// at /authorize with invalid_target, and this example says so and stops.
//
// The person's yes is the one stand-in, as in agent.mjs: a synthetic identity's
// session cookie posts it, where a real person taps a passkey on the phone.
//
// It registers three sandbox clients (this server's, the caller's, and a
// stranger's that the server does not accept) and a synthetic person at run
// time, and deletes every client at the end. It prints no secret.
import http from "node:http";

import { createAgent, PersonStopped, TokenRefused } from "../../lib/person-managed-auth/src/client.js";
import { nodeHandler } from "../../lib/person-managed-auth/src/node.js";
import { createResourceServer } from "../../lib/person-managed-auth/src/server.js";
import { baseUrl, challengeParams } from "../../lib/person-managed-auth/src/shared.js";
import {
  REDIRECT_URL, SANDBOX, cut, deleteAll, deleteClient, getClient, hasFailed, liveGrantsTo, mintPerson, newestReadInLedger, ok,
  readsInLedger, registerClient, revokeGrant, say, step, theYes,
} from "./sandbox.mjs";
import { syntheticMcp } from "./synthetic-mcp.mjs";

let listener;
let person;
let serverClient;
let callerClient;
const agents = [];

try {
  // ---- the server, in the builder's own process ---------------------------
  // Listen first: the port is not known until then, and the resource the
  // sandbox is told about has to carry it.
  let pma;
  const statuses = []; // what this server answered, newest last
  listener = http.createServer((req, res) => {
    res.on("finish", () => statuses.push(res.statusCode));
    return nodeHandler(pma, syntheticMcp(pma), { raw: true })(req, res);
  });
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;

  // The resource string, as the library will hold and compare it: it lower-cases
  // the host and drops a default port and a trailing slash. The sandbox matches
  // the registered string byte for byte, so register this one and not your own
  // spelling of it.
  const resource = baseUrl(base + "/mcp", "resource");

  serverClient = await registerClient("Person-managed authorization example server", { resources: [resource] });
  callerClient = await registerClient("Person-managed authorization example caller"); // the same developer token owns both
  person = await mintPerson();
  ok(true, `registered the server's client ${serverClient.id} and the caller's ${callerClient.id}; synthetic person ${person.did}`);
  const registered = await getClient(serverClient);
  ok(registered.status === 200 && registered.resources?.length === 1 && registered.resources[0] === resource,
    `the sandbox holds the resource on the server's client: ${JSON.stringify(registered.resources)}`);

  pma = createResourceServer({
    resource,                                     // the identifier of this resource
    authorizationServer: SANDBOX,                 // whose tokens it accepts
    clientId: serverClient.id,                    // this server's own registered client
    clientSecret: serverClient.secret,            //   (goes only to the authorization server's origin)
    scopes: ["daily", "cgm", "recovery"],
    scope: "daily",                               // the one scope a 401 suggests
    grantees: [callerClient.id],                  // who may hold a token for this server
    accessor: "person-managed-authorization-example",
  });
  ok(pma.resource === resource, "the string registered is the string the library compares");
  say(`server    ${pma.resource}`);
  say(`issuer    ${pma.issuer}`);

  // Note the audience of the last token this server accepted, so the run can
  // show what the sandbox put in `aud`. The library's grant carries it.
  let lastGrant = null;
  const authenticate = pma.authenticate.bind(pma);
  pma.authenticate = async (...args) => (lastGrant = await authenticate(...args));

  const agentFor = (client, name) => {
    const agent = createAgent({
      resource: pma.resource,
      issuer: SANDBOX,
      clientId: client.id,
      clientSecret: client.secret,
      redirectUrl: REDIRECT_URL,
      clientName: name,
      purpose: "person-managed authorization server example",
    });
    agents.push(agent);
    return agent;
  };

  step("1. discovery: a request with no token gets the challenge, and the challenge leads to the authorization server");
  const bare = await fetch(pma.resource, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const challenge = bare.headers.get("www-authenticate");
  say(`     POST ${pma.resource} -> ${bare.status}`);
  say(`     WWW-Authenticate: ${challenge}`);
  const params = challengeParams(challenge);
  ok(bare.status === 401 && params.resource_metadata === pma.metadataUrl && params.scope === "daily", "401 names the metadata and the one scope it suggests");
  const prm = await (await fetch(params.resource_metadata)).json();
  say(`     GET ${params.resource_metadata} -> resource ${prm.resource}, authorization_servers ${JSON.stringify(prm.authorization_servers)}`);
  ok(prm.authorization_servers[0] === SANDBOX && prm.resource === pma.resource, "the metadata names this resource and the sandbox");

  step("2. the caller is led to the person: the authorize URL names this server as the resource");
  const agent = agentFor(callerClient, "Person-managed authorization example caller");
  const first = await agent.connect();
  ok(!first.ok && first.ask.reason === "first", `the person has to be asked (scope ${first.ask?.scope}, the one the server suggested)`);
  const u = new URL(first.ask.authorizeUrl);
  say(`     authorize URL: ${u.origin}${u.pathname}`);
  for (const k of ["response_type", "client_id", "scope", "resource", "code_challenge_method", "purpose"]) say(`       ${k} = ${u.searchParams.get(k)}`);
  ok(u.searchParams.get("resource") === pma.resource, "the resource asked for is this server's own");

  step("3. the person's yes (stand-in: the synthetic identity's session posts it; a real person taps a passkey on the phone)");
  let yes;
  try {
    yes = await theYes(first.ask.authorizeUrl, person);
  } catch (e) {
    if (/invalid_target/.test(e.message)) {
      say("     the sandbox did not accept the server's resource. A sandbox older than 0.27.0 does not; the hosted one does from 0.27.0.");
    }
    throw e;
  }
  say(`     the question, as the person reads it: ${yes.question.slice(0, 260)}`);
  const cb = new URL(yes.callback);
  say(`     callback: code=${cut(cb.searchParams.get("code"))} state=${cut(cb.searchParams.get("state"))} iss=${cb.searchParams.get("iss")}`);
  const held = await agent.finishAuth(yes.callback);
  ok(held.state === "held" && held.scope === first.ask.scope, `a token for scope ${held.scope} is held (it expires ${held.expires_at})`);

  step("4. a read under the grant: the server asks the sandbox about the token, writes the ledger line, then answers with the receipt");
  const read = await agent.callTool("read_scope", { scope: "daily" });
  ok(read.ok && !read.result.isError, `read_scope(daily) answered`);
  say(`     the token this server accepted has aud ${lastGrant?.audience}`);
  ok(lastGrant?.audience === pma.resource, "the token's aud is this server's loopback resource");
  say(`     receipt: consent_id ${cut(read.receipt?.consent_id?.split(":").at(-1))}  ledger_entry_hash ${cut(read.receipt?.ledger_entry_hash)}  recorded ${read.receipt?.access_recorded}`);
  ok(Boolean(read.receipt?.consent_id && read.receipt?.ledger_entry_hash), "the receipt is a consent id and a hash");
  const line = await newestReadInLedger(person);
  say(`     the person's ledger: ${line?.description ?? "(none)"}`);
  ok(line?.description?.includes("person-managed-authorization-example"), "the person's ledger names this server as the reader");

  step("5. a read of a scope the token does not cover is refused on that one call, writes nothing, and the caller asks for that scope alone");
  const readsBefore = (await readsInLedger(person)).length;
  const refused = await agent.callTool("read_scope", { scope: "cgm" });
  ok(!refused.ok && refused.ask.reason === "step_up" && refused.ask.scope === "cgm", `403 insufficient_scope named ${refused.ask?.scope}; authorization re-ran for it alone`);
  ok((await readsInLedger(person)).length === readsBefore, "nothing was written to the person's ledger for the refused call");
  const yes2 = await theYes(refused.ask.authorizeUrl, person);
  await agent.finishAuth(yes2.callback);
  const read2 = await agent.callTool("read_scope", { scope: "cgm" });
  ok(read2.ok && !read2.result.isError && lastGrant?.audience === pma.resource, "read_scope(cgm) answered under the second token, aud again this server");
  ok(read2.receipt?.consent_id !== read.receipt?.consent_id, "a second grant, one per scope");

  step("6. a token this server does not accept: wrong grantee");
  const stranger = await registerClient("Person-managed authorization example stranger");
  try {
    // The same developer's other client may ask for the resource too; whether
    // it may hold a token for this server is the server's choice (grantees).
    const outsider = agentFor(stranger, "Person-managed authorization example stranger");
    const ask = await outsider.connect();
    await outsider.finishAuth((await theYes(ask.ask.authorizeUrl, person)).callback);
    let refusal = null;
    try { await outsider.callTool("read_scope", { scope: "daily" }); } catch (e) { refusal = e; }
    ok(refusal instanceof TokenRefused, `a token issued to another client -> ${refusal?.name}, the server answered ${statuses.at(-1)}`);
    for (const g of await liveGrantsTo(person, stranger.id)) await revokeGrant(person, g.consent_id);
  } finally {
    await deleteClient(stranger);
  }

  step("7. the person revokes in the data-rights panel (its API)");
  const grants = await liveGrantsTo(person, callerClient.id);
  for (const g of grants) {
    const r = await revokeGrant(person, g.consent_id);
    ok(r.status === 200, `revoke ${cut(g.consent_id.split(":").at(-1))}: ${r.status}, tokens invalidated ${r.tokens_invalidated}`);
  }

  step("8. the very next request is refused: nothing was cached");
  let stop = null;
  try { await agent.callTool("read_scope", { scope: "cgm" }); } catch (e) { stop = e; }
  say(`     the server answered ${statuses.at(-1)}`);
  ok(stop instanceof PersonStopped && statuses.at(-1) === 401, `401 at the next request; the caller's library reports ${stop?.name}`);
  say(`     ${stop?.message}`);
  ok(agent.stopped.aborted, "agent.stopped is aborted: the caller stops by itself and asks nobody");
} catch (e) {
  ok(false, `${e?.name ?? "Error"}: ${e?.message ?? e}`);
} finally {
  step("9. clean up");
  for (const a of agents) await a.close().catch(() => {});
  listener?.closeAllConnections?.();
  listener?.close();
  await deleteAll();
}

say(hasFailed() ? "\nsome step did not answer as expected" : "\nthe loop closed: challenged, led to the sandbox, asked, read under the resource, receipted, stepped up, stopped");
process.exit(hasFailed() ? 1 : 0);
