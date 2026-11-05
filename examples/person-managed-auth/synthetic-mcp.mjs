// A tiny MCP endpoint (streamable HTTP, stateless, JSON responses) that holds
// one synthetic fact about a person and serves it through the server half of
// the person-managed authorization library. It is the "something of a
// person's" in the server example, and the resource the library's own tests
// run against.
//
// What it shows about using the library in an MCP server:
//   - every message is authorized (server.authenticate) before anything else,
//     initialize and tools/list included, so a stop ends the session at the
//     next message;
//   - only a tools/call read is a read: it checks the scope on that one call
//     (server.requireScope, which refuses with the 403 step-up header), writes
//     the ledger line (server.record) before it answers, and puts the receipt
//     in the result;
//   - a JSON-RPC batch cannot be answered with one HTTP status, so a refused
//     element in a batch is answered in band, as a tool error.
//
// The data is synthetic and carries no value: a band and a sentence, the same
// kind of interpreted output the sandbox source serves.
import { Refusal } from "../../lib/person-managed-auth/src/server.js";

const PROTOCOL = "2025-06-18";

const FACTS = {
  daily: { band: "drifting", sentence: "Everyday signals are drifting in this synthetic example." },
  cgm: { band: "on-track", sentence: "Glucose stability is on track in this synthetic example." },
  recovery: { band: "off-track", sentence: "Recovery is off track in this synthetic example." },
};

const TOOLS = [{
  name: "read_scope",
  description: "Read one scope of the synthetic example. The token must cover exactly this scope.",
  inputSchema: { type: "object", properties: { scope: { type: "string" } }, required: ["scope"] },
}];

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

function toolResult(payload, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError };
}

// The scope a single tools/call is for, read from a clone so the body stays
// unread, or undefined (a batch, another method, an unparseable body).
async function callScope(request) {
  try {
    const m = await request.clone().json();
    if (m && !Array.isArray(m) && m.method === "tools/call" && m.params?.name === "read_scope") {
      return m.params.arguments?.scope;
    }
  } catch (_) { /* no usable body: the default */ }
  return undefined;
}

export function syntheticMcp(server) {
  async function handleOne(message, grant, { single }) {
    const { id, method, params } = message;
    if (id === undefined) return null; // a notification
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "synthetic-example", version: "0.1.0" },
      });
    }
    if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
    if (method !== "tools/call" || params?.name !== "read_scope") return rpcError(id, -32601, "method not found");
    const scope = params.arguments?.scope;
    try {
      if (!Object.hasOwn(FACTS, scope)) throw new Refusal(404, "unknown_scope", `unknown scope ${JSON.stringify(scope)}`);
      server.requireScope(grant, scope);
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      // A single call is refused at the transport (the step-up header). Anything
      // else, and every refusal inside a batch, is a tool error.
      if (single && e.error === "insufficient_scope") throw e;
      return rpcResult(id, toolResult({ ...e.body(), status: e.status }, true));
    }
    const receipt = await server.record(grant); // written before the answer
    return rpcResult(id, toolResult({ fixture: true, notice: "Synthetic example data. Not a person.", scope, ...FACTS[scope], ...receipt }));
  }

  return async function handler(request) {
    if (request.method !== "POST") return json(405, { detail: "this endpoint takes POST", error: "method_not_allowed" }, { allow: "POST" });
    // every message, every time. A 401 names the one scope it suggests: the
    // scope of a single tools/call when the body names one, otherwise the default.
    const grant = await server.authenticate(request, { suggest: await callScope(request) });
    let body;
    try { body = await request.json(); } catch (_) { return json(400, rpcError(null, -32700, "parse error")); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleOne(m, grant, { single: false })))).filter(Boolean);
      return out.length ? json(200, out) : new Response(null, { status: 202 });
    }
    const out = await handleOne(body, grant, { single: true });
    return out ? json(200, out) : new Response(null, { status: 202 });
  };
}
