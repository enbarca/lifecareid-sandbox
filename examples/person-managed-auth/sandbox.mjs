// Helpers the two examples share to talk to the LifeCare.ID® sandbox as the
// developer and as the synthetic person. None of this is the library: the
// library never renders the person's yes and never holds a developer token.
//
// The developer access token (LIFECAREID_DEVACCESS_TOKEN, from
// https://app.lifecare.id/devaccess) is a credential for one origin. It goes
// only to SANDBOX, the sandbox you named or the hosted one, and nowhere else.
import { cut } from "../../lib/person-managed-auth/src/shared.js";

export { cut };

export const SANDBOX = (process.env.SANDBOX || "https://sandbox.lifecare.id").replace(/\/+$/, "");
export const DEVACCESS = process.env.LIFECAREID_DEVACCESS_TOKEN || "";
export const REDIRECT_URL = "http://127.0.0.1:4000/callback";

if (!/^https:\/\/[^/]+$/.test(SANDBOX) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SANDBOX)) {
  console.log(`FAIL SANDBOX must be an https origin, or http on loopback (got ${SANDBOX})`);
  process.exit(1);
}

let failed = false;
export const fail = () => { failed = true; };
export const hasFailed = () => failed;

export function say(line = "") {
  console.log(line);
}
export function step(title) {
  console.log(`\n--- ${title}`);
}
export function ok(condition, line) {
  if (!condition) failed = true;
  console.log(`${condition ? "ok  " : "FAIL"} ${line}`);
  return Boolean(condition);
}

async function call(method, path, { bearer, basic, cookie, body } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (bearer) headers.authorization = "Bearer " + bearer;
  if (basic) headers.authorization = "Basic " + Buffer.from(basic).toString("base64");
  if (cookie) headers.cookie = cookie;
  const res = await fetch(SANDBOX + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

// ---- the developer ----------------------------------------------------------

export async function registerClient(name) {
  const r = await call("POST", "/v1/sandbox/clients", { bearer: DEVACCESS || undefined, body: { name, redirect_uris: [REDIRECT_URL] } });
  if (r.status !== 200) {
    ok(false, `register a client: ${r.status} ${r.json?.detail ?? ""}`);
    if (r.status === 401 && !DEVACCESS) say("     the hosted sandbox needs LIFECAREID_DEVACCESS_TOKEN (https://app.lifecare.id/devaccess)");
    process.exit(1);
  }
  return { id: r.json.client_id, secret: r.json.client_secret };
}

export async function deleteClient(client) {
  // The client's own secret is the credential; the hosted sandbox also wants the
  // developer access token as the lc_dev cookie here.
  const r = await call("DELETE", `/v1/sandbox/clients/${encodeURIComponent(client.id)}`, {
    basic: `${client.id}:${client.secret}`, cookie: DEVACCESS ? `lc_dev=${DEVACCESS}` : undefined,
  });
  ok(r.status === 200, `delete the client ${client.id}: ${r.status}`);
}

// ---- the synthetic person ---------------------------------------------------

export async function mintPerson() {
  const r = await call("POST", "/v1/sandbox/test-identity", { bearer: DEVACCESS || undefined, body: {} });
  if (r.status !== 200) { ok(false, `mint a synthetic person: ${r.status}`); process.exit(1); }
  return { did: r.json.did, session: r.json.session_token };
}

// The person's yes. In production this is a passkey tap on the phone, on the
// LifeCare.ID® origin. The sandbox lets a synthetic identity's session cookie
// stand in for the tap, so this example fetches the grant page the way the
// person's browser would, checks that it is on the sandbox origin, reads its
// terms back, and posts the form with decision=approve. It is not part of the
// library and a real agent never does it: it hands the person the URL.
export async function theYes(authorizeUrl, person) {
  const u = new URL(authorizeUrl);
  if (u.origin !== new URL(SANDBOX).origin) throw new Error(`refusing to show the yes anywhere but ${SANDBOX}: ${u.origin}`);
  const cookie = `__Host-lc_id_session=${person.session}`;
  const page = await fetch(u, { headers: { cookie }, redirect: "manual" });
  const html = await page.text();
  const text = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&reg;/g, "®").replace(/\s+/g, " ").trim();
  const action = html.match(/<form method="post" action="([^"]+)"/)?.[1];
  if (page.status !== 200 || !action) throw new Error(`the grant page did not render (${page.status})`);
  const form = new URLSearchParams();
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) {
    form.set(m[1], m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
  }
  form.set("decision", "approve");
  const decided = await fetch(new URL(action, SANDBOX), {
    method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: form, redirect: "manual",
  });
  const location = decided.headers.get("location");
  if (decided.status !== 303 || !location) throw new Error(`the yes was not accepted (${decided.status})`);
  return { callback: location, question: text };
}

export async function liveGrantsTo(person, clientId) {
  const r = await call("GET", "/v1/panel/summary", { bearer: person.session });
  const list = r.json?.grants ?? [];
  return list.filter((g) => (g.grantee?.id ?? g.grantee) === clientId).map((g) => ({ consent_id: g.consent_id ?? g.id, expires_at: g.expires_at }));
}

// The person revokes in the data-rights panel (its API).
export async function revokeGrant(person, consentId) {
  const r = await call("POST", "/v1/panel/revoke", { bearer: person.session, body: { consent_id: consentId } });
  return { status: r.status, tokens_invalidated: r.json?.tokens_invalidated };
}

// The reads in the person's own ledger, oldest first.
export async function readsInLedger(person) {
  const r = await call("GET", `/v1/consent/ledger/${encodeURIComponent(person.did)}`, { bearer: person.session });
  return (r.json?.entries ?? []).filter((e) => e.event_type === "data_access");
}

// The line the person's own ledger shows for the newest read.
export async function newestReadInLedger(person) {
  return (await readsInLedger(person)).at(-1) ?? null;
}

// The walkthrough path (steps 3 and 4 of the sandbox guide): the person's
// session makes the grant and asks for the token directly.
export async function grantAndToken(person, client, { scope, purpose }) {
  const granted = await call("POST", "/v1/consent/grant", {
    bearer: person.session,
    body: { subject_did: person.did, grantee: { name: "Person-managed authorization example", id: client.id },
      scopes: [scope], purpose: { text: purpose }, duration_days: 1 },
  });
  if (granted.status !== 200) throw new Error(`grant: ${granted.status} ${granted.json?.detail ?? ""}`);
  const issued = await call("POST", "/v1/token", {
    bearer: person.session, body: { subject_did: person.did, scope, purpose, requester: client.id },
  });
  if (issued.status !== 200) throw new Error(`token: ${issued.status} ${issued.json?.detail ?? ""}`);
  return { consentId: granted.json.consent_id, token: issued.json.access_token };
}
