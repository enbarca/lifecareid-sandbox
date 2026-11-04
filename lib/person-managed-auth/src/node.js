// Person-managed authorization, server half, for Node's http module (draft 1).
//
//   import http from "node:http";
//   import { createResourceServer } from "@lifecareid/person-managed-auth/server";
//   import { nodeHandler } from "@lifecareid/person-managed-auth/node";
//
//   const pma = createResourceServer({ ... });
//   http.createServer(nodeHandler(pma, async (request, { grant, receipt }) => ({ ... }), { scope: "daily" }))
//       .listen(8801);
//
// One route handler: the protected resource metadata at its well-known path,
// and every other request authenticated, recorded and then handed to your
// handler. For an MCP server whose handler authorizes each message itself,
// pass { raw: true } and call server.authenticate and server.record yourself.
import { Readable } from "node:stream";

// Hop-by-hop headers, and the ones the web Request derives itself.
const SKIP_HEADERS = new Set(["host", "connection", "keep-alive", "transfer-encoding", "content-length"]);

export function toRequest(req) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || SKIP_HEADERS.has(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

export async function writeResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}

export function nodeHandler(server, handler, options = {}) {
  const run = server.fetchHandler(handler, options);
  return async (req, res) => {
    try {
      await writeResponse(await run(toRequest(req), { req }), res);
    } catch (_) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ detail: "internal error", error: "internal_error" }));
    }
  };
}
