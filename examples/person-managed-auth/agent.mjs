#!/usr/bin/env node
// Client half, end to end, against the hosted sandbox (person-managed
// authorization, draft 1).
//
//   LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/agent.mjs
//
// An agent reads from the sandbox's synthetic MCP source. It is led to the
// person's yes by the standard, gets one single-scope token, reads, keeps the
// receipt, steps up to a second scope when the server says so, and stops when
// the person revokes.
//
// Two things stand in for the real world and are marked where they happen:
//   - the person's yes. A real agent hands the person the URL and takes back
//     what they send; here a synthetic identity's session cookie posts the yes
//     (the same stand-in the sandbox walkthrough uses for the passkey tap);
//   - the person's revoke, which is the data-rights panel's API.
//
// It registers a sandbox client and a synthetic person at run time and deletes
// the client at the end. It prints no secret: codes and tokens are cut to ten
// characters, and the library prints nothing.
import { createAgent, PersonStopped } from "../../lib/person-managed-auth/src/client.js";
import {
  DEVACCESS, REDIRECT_URL, SANDBOX, cut, deleteClient, hasFailed, liveGrantsTo, mintPerson, newestReadInLedger,
  ok, registerClient, revokeGrant, say, step, theYes,
} from "./sandbox.mjs";

const RESOURCE = (process.env.RESOURCE || "https://lifecare.id/sandbox-source/mcp");
const STEP_UP = process.env.STEP_UP !== "0";

say(`resource  ${RESOURCE}`);
say(`issuer    ${SANDBOX}  (the only origin the client secret goes to)`);

const client = await registerClient("Person-managed authorization example agent");
const person = await mintPerson();
ok(true, `registered client ${client.id}; synthetic person ${person.did}`);

try {
  const agent = createAgent({
    resource: RESOURCE,
    issuer: SANDBOX,
    clientId: client.id,
    clientSecret: client.secret,
    redirectUrl: REDIRECT_URL,
    clientName: "Person-managed authorization example agent",
    purpose: "person-managed authorization example",
    onStopped: (stop) => say(`     onStopped: ${stop.message}`),
  });

  step("1. connect: the library reads the server's challenge, discovers the authorization server, and stops at the person");
  const first = await agent.connect();
  ok(!first.ok && first.ask.reason === "first", `the person has to be asked (scope ${first.ask?.scope}, the one the server suggested)`);
  const u = new URL(first.ask.authorizeUrl);
  say(`     authorize URL: ${u.origin}${u.pathname}`);
  for (const k of ["response_type", "client_id", "scope", "resource", "code_challenge_method", "purpose"]) say(`       ${k} = ${u.searchParams.get(k)}`);
  say(`       code_challenge = ${cut(u.searchParams.get("code_challenge"))}   state = ${cut(u.searchParams.get("state"))}`);
  ok(u.origin === new URL(SANDBOX).origin, "the yes is on the authorization server's origin");

  step("2. the person's yes (stand-in: the synthetic identity's session posts it; a real person taps a passkey on the phone)");
  const yes = await theYes(first.ask.authorizeUrl, person);
  say(`     the question, as the person reads it: ${yes.question.slice(0, 200)}`);
  const cb = new URL(yes.callback);
  say(`     callback: code=${cut(cb.searchParams.get("code"))} state=${cut(cb.searchParams.get("state"))} iss=${cb.searchParams.get("iss")}`);

  step("3. finishAuth: state and issuer are checked, the code becomes a token bound to this resource");
  const held = await agent.finishAuth(yes.callback);
  ok(held.state === "held" && held.scope === first.ask.scope, `a token for scope ${held.scope} is held (it expires ${held.expires_at})`);

  step("4. read: the library carries the token, and the answer carries the receipt");
  const tools = await agent.listTools();
  say(`     tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  // The source names its owner in list_scopes; read_scope takes that owner.
  const scopes = await agent.callTool("list_scopes");
  const owner = scopes.result?.structuredContent?.resource_owner ?? scopes.result?.structuredContent?.owner ?? person.did;
  const read = await agent.callTool("read_scope", { scope: held.scope, owner });
  ok(read.ok && !read.result.isError, `read_scope(${held.scope}) answered`);
  say(`     receipt: consent_id ${cut(read.receipt?.consent_id?.split(":").at(-1))}  ledger_entry_hash ${cut(read.receipt?.ledger_entry_hash)}  recorded ${read.receipt?.access_recorded}`);
  ok(Boolean(read.receipt?.consent_id && read.receipt?.ledger_entry_hash), "the receipt is a consent id and a hash");

  step("5. show my grant, show my receipts");
  const grant = await agent.showMyGrant({ live: true });
  say(`     grant: ${JSON.stringify({ state: grant.state, scope: grant.scope, expires_at: grant.expires_at, live_active: grant.live?.active })}`);
  say(`     receipts held: ${agent.showMyReceipts().length}, fields ${Object.keys(agent.showMyReceipts()[0] ?? {}).join(", ")}`);
  const line = await newestReadInLedger(person);
  say(`     the person's ledger: ${line?.description ?? "(no data_access line found)"}`);
  ok(Boolean(line), "the read is in the person's ledger");

  if (STEP_UP) {
    step("6. step-up: a read of another scope is refused on that one call, and the library asks for that scope alone");
    const other = held.scope === "cgm" ? "daily" : "cgm";
    const step1 = await agent.callTool("read_scope", { scope: other, owner });
    ok(!step1.ok && step1.ask.reason === "step_up" && step1.ask.scope === other, `403 insufficient_scope named ${step1.ask?.scope}; authorization re-ran for it alone`);
    const yes2 = await theYes(step1.ask.authorizeUrl, person);
    await agent.finishAuth(yes2.callback);
    const read2 = await agent.callTool("read_scope", { scope: other, owner });
    ok(read2.ok && !read2.result.isError, `read_scope(${other}) answered under the second token`);
    say(`     receipt: consent_id ${cut(read2.receipt?.consent_id?.split(":").at(-1))}  ledger_entry_hash ${cut(read2.receipt?.ledger_entry_hash)}`);
    ok(read2.receipt?.consent_id !== read.receipt?.consent_id, "a second grant, one per scope");
  }

  step("7. the person revokes in the data-rights panel (its API)");
  const grants = await liveGrantsTo(person, client.id);
  say(`     live grants to this client: ${grants.length}`);
  for (const g of grants) {
    const r = await revokeGrant(person, g.consent_id);
    ok(r.status === 200, `revoke ${cut(g.consent_id.split(":").at(-1))}: ${r.status}, tokens invalidated ${r.tokens_invalidated}`);
  }

  step("8. the next read is refused, the stop is signalled, and nothing retries by itself");
  const asked = []; // the library makes no request after the stop; count them
  let refusal = null;
  try {
    await agent.callTool("read_scope", { scope: agent.showMyReceipts().at(-1)?.scope ?? held.scope, owner });
  } catch (e) {
    refusal = e;
  }
  ok(refusal instanceof PersonStopped, `read after revoke: ${refusal?.name}`);
  say(`     ${refusal?.message}`);
  ok(agent.stopped.aborted && agent.stopped.reason === refusal, "agent.stopped is aborted, with the stop as its reason");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...a) => { asked.push(String(a[0])); return realFetch(...a); };
  let again = null;
  try { await agent.callTool("read_scope", { scope: held.scope, owner }); } catch (e) { again = e; }
  globalThis.fetch = realFetch;
  ok(again instanceof PersonStopped && asked.length === 0, `a second call fails at once, with ${asked.length} requests made`);
  say(`     grant state: ${(await agent.showMyGrant()).state}`);
  await agent.close();
} catch (e) {
  ok(false, `${e?.name ?? "Error"}: ${e?.message ?? e}`);
} finally {
  step("9. clean up");
  await deleteClient(client);
}

say(hasFailed() ? "\nsome step did not answer as expected" : "\nthe loop closed: discovered, asked, read, receipted, stepped up, stopped");
process.exit(hasFailed() ? 1 : 0);
