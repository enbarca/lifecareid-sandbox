// The walk. Plain JavaScript, no framework. Secrets never come here: the client
// secret and the token live in the backend, and this page shows codes, tokens
// and hashes cut to ten characters.
const $ = (id) => document.getElementById(id);
const cut = (s) => (typeof s === "string" && s.length > 10 ? s.slice(0, 10) + "…" : s);
let cfg;
const walk = {};

function out(n, ...parts) {
  const el = $("o" + n);
  el.textContent += (el.textContent ? "\n" : "") + parts.join("\n");
}
function state(n, s) {
  $("s" + n).dataset.state = s;
}
function unlock(n, buttons) {
  state(n, "ready");
  for (const b of buttons) $(b).disabled = false;
}
async function json(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch (_) { /* not JSON */ }
  return { res, body };
}
const post = (path, body) => json(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function guarded(n, fn) {
  try { await fn(); } catch (e) { out(n, "stopped: " + (e && e.message ? e.message : e)); }
}

async function boot() {
  const { body } = await json("/api/config");
  cfg = body;
  $("facts").textContent =
    `Sandbox ${cfg.sandbox}. Source ${cfg.source}. Synthetic person ${cfg.person_did}. Client ${cfg.client_id}, registered for this run and deleted when the backend stops.`;
}

// 1. discovery ---------------------------------------------------------------
$("b1").onclick = () => guarded(1, async () => {
  $("b1").disabled = true;
  const src = new URL(cfg.source);
  const prmUrl = `${src.origin}/.well-known/oauth-protected-resource${src.pathname}/mcp`;
  out(1, `GET ${prmUrl}`);
  const prm = await json(prmUrl);
  out(1, `-> ${prm.res.status}`, JSON.stringify(prm.body, null, 2));
  const issuer = (prm.body?.authorization_servers || [])[0] || cfg.sandbox;
  const metaUrl = `${issuer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`;
  out(1, "", `GET ${metaUrl}`);
  const meta = await json(metaUrl);
  const m = meta.body || {};
  out(1, `-> ${meta.res.status}`, JSON.stringify({
    issuer: m.issuer, authorization_endpoint: m.authorization_endpoint, token_endpoint: m.token_endpoint,
    code_challenge_methods_supported: m.code_challenge_methods_supported,
    authorization_response_iss_parameter_supported: m.authorization_response_iss_parameter_supported,
  }, null, 2));
  if (prm.res.status !== 200 || meta.res.status !== 200) throw new Error("discovery did not answer 200");
  const issuerOk = (prm.body.authorization_servers || [])[0] === m.issuer;
  const resourceOk = prm.body.resource === `${src.origin}${src.pathname}/mcp`;
  out(1, "", `check: the metadata names this source as the resource: ${resourceOk ? "yes" : "no"}`,
    `check: its first authorization server is the issuer whose metadata was read: ${issuerOk ? "yes" : "no"}`);
  if (!resourceOk || !issuerOk) throw new Error("the metadata does not match the source or the issuer");
  walk.prmUrl = prmUrl;
  walk.resource = prm.body.resource;
  walk.authorizeEndpoint = m.authorization_endpoint || `${issuer}/authorize`;
  state(1, "done");
  unlock(2, ["b2"]);
});

// 2. the challenge -------------------------------------------------------------
$("b2").onclick = () => guarded(2, async () => {
  $("b2").disabled = true;
  const url = walk.resource;
  out(2, `POST ${url}  (no Authorization header)`);
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const challenge = res.headers.get("www-authenticate");
  out(2, `-> ${res.status}`, `WWW-Authenticate: ${challenge}`);
  if (res.status !== 401 || !challenge) throw new Error("expected a 401 with a challenge");
  walk.challenge = Object.fromEntries([...challenge.matchAll(/([a-z_]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const sameDoc = walk.challenge.resource_metadata === walk.prmUrl;
  out(2, "", `check: the challenge names the metadata document fetched in step 1: ${sameDoc ? "yes" : "no"}`);
  if (!sameDoc) throw new Error("the challenge names a different metadata document");
  out(2, `the scope to ask for: ${walk.challenge.scope}`, `the metadata: ${walk.challenge.resource_metadata}`);
  state(2, "done");
  unlock(3, ["b3"]);
});

// 3. the person's yes ----------------------------------------------------------
function receiveRedirect(callbackUrl, expectedState) {
  // The redirect lands in a hidden frame on this page's own origin, whose
  // receiver (callback.js) hands the code back with postMessage. A frame, not a
  // popup, so no popup blocker stands in the way; an app of yours may use either.
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    const done = () => { clearTimeout(timer); window.removeEventListener("message", onMessage); frame.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error("the redirect did not arrive")); }, 15000);
    function onMessage(ev) {
      if (ev.origin !== location.origin || ev.source !== frame.contentWindow || ev.data?.type !== "pma-callback") return;
      done();
      if (ev.data.error) return reject(new Error("the issuer answered " + ev.data.error));
      if (ev.data.state !== expectedState) return reject(new Error("state did not match"));
      resolve(ev.data);
    }
    window.addEventListener("message", onMessage);
    frame.src = callbackUrl;
    document.body.appendChild(frame);
  });
}

$("b3").onclick = () => guarded(3, async () => {
  $("b3").disabled = true;
  walk.verifier = rand(32);
  walk.state = rand(16);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(walk.verifier)));
  const challenge = b64url(digest);
  const u = new URL(walk.authorizeEndpoint);
  const params = {
    response_type: "code", client_id: cfg.client_id, redirect_uri: cfg.redirect_uri, state: walk.state,
    code_challenge: challenge, code_challenge_method: "S256", scope: walk.challenge?.scope || cfg.scope,
    purpose: "person-managed authorization page", resource: walk.resource,
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  walk.scope = params.scope;
  out(3, `GET ${u.origin}${u.pathname}`);
  for (const [k, v] of Object.entries(params)) out(3, `  ${k} = ${k === "state" || k === "code_challenge" ? cut(v) : v}`);
  out(3, "", "the backend gives the yes as the synthetic person (a real person taps a passkey):");
  const yes = await post("/api/yes", { authorize_url: u.href });
  if (yes.res.status !== 200) throw new Error(yes.body?.detail || "the yes was not accepted");
  out(3, `the question, as the person reads it: ${yes.body.question}`);
  const cb = new URL(yes.body.callback);
  out(3, "", `redirect: ${cb.origin}${cb.pathname}`,
    `  code = ${cut(cb.searchParams.get("code"))}  state = ${cut(cb.searchParams.get("state"))}  iss = ${cb.searchParams.get("iss")}`);
  const got = await receiveRedirect(yes.body.callback, walk.state);
  walk.code = got.code;
  out(3, "", `the page received the code ${cut(got.code)} and the state matched.`);
  state(3, "done");
  unlock(4, ["b4"]);
});

// 4. the exchange ----------------------------------------------------------------
$("b4").onclick = () => guarded(4, async () => {
  $("b4").disabled = true;
  out(4, "POST /api/exchange (this page to its backend)",
    `  code = ${cut(walk.code)}`, `  code_verifier = ${cut(walk.verifier)}`, "",
    "the backend then posts to the sandbox's token endpoint with the grant, the redirect URI, the resource, the client id and the client secret (held there, not shown).");
  const { res, body } = await post("/api/exchange", { code: walk.code, code_verifier: walk.verifier });
  out(4, "", `-> ${res.status}`, JSON.stringify(body, null, 2));
  if (!body || body.status !== 200) throw new Error("the sandbox did not issue a token");
  state(4, "done");
  unlock(5, ["b5"]);
});

// 5. the read, the revoke, the refusal -----------------------------------------
function showRead(label, r) {
  out(5, label, `-> ${r.status}`);
  if (r.status === 200) {
    out(5, `persona: ${r.persona}`, `data: ${JSON.stringify(r.data, null, 2)}`, "",
      "receipt:", `  consent_id = ${r.receipt.consent_id}`, `  ledger_entry_hash = ${r.receipt.ledger_entry_hash}`, `  access_recorded = ${r.receipt.access_recorded}`,
      `the person's ledger: ${r.access_record}`);
  } else {
    out(5, `WWW-Authenticate: ${r.www_authenticate}`, `error: ${r.error}`, r.detail ? `detail: ${r.detail}` : "");
  }
}
$("b5").onclick = () => guarded(5, async () => {
  $("b5").disabled = true;
  const { body } = await post("/api/read");
  showRead(`GET ${cfg.source}/v1/source/${cfg.scope}?owner=${cfg.person_did}  (bearer token held by the backend)`, body);
  $("b6").disabled = false;
});
$("b6").onclick = () => guarded(5, async () => {
  $("b6").disabled = true;
  const { body } = await post("/api/revoke");
  out(5, "", "the person revokes in the data-rights panel:", ...body.revoked.map((g) => `  grant ${g.consent_id}: ${g.status}, tokens invalidated ${g.tokens_invalidated}`));
  $("b7").disabled = false;
});
$("b7").onclick = () => guarded(5, async () => {
  $("b7").disabled = true;
  const { body } = await post("/api/read");
  showRead("", body);
  out(5, "", body.status === 401 ? "refused at the very next request: nothing was cached." : "the read was not refused; check the revoke step.");
  state(5, "done");
});

boot().catch((e) => { $("facts").textContent = "The backend did not answer: " + e.message; });
