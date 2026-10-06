// A small Node server around source/source.js, for a sandbox run locally.
//
// The hosted source is a Cloudflare Pages Function (pages/), which needs the
// Pages runtime. This file gives the same handlers a runtime on your machine:
// Node's http module turns each incoming request into a web Request, hands it
// to handleRequest exactly as the Pages function does, and writes the Response
// back. No behaviour lives here.
//
// Environment, the same three variables the Pages function reads:
//   LIFECAREID_SANDBOX_ORIGIN                the sandbox to introspect tokens at
//   LIFECAREID_SANDBOX_SOURCE_CLIENT_ID      the source's own client id there
//   LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET  and its secret
// plus PORT (default 8799) and HOST (default 0.0.0.0).
import http from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { PREFIX, handleRequest } from "../../source/source.js";

const PORT = Number(process.env.PORT || 8799);
const HOST = process.env.HOST || "0.0.0.0";
const ENV_KEYS = [
  "LIFECAREID_SANDBOX_ORIGIN",
  "LIFECAREID_SANDBOX_SOURCE_CLIENT_ID",
  "LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET",
];
// Hop-by-hop headers, and the ones the web Request derives itself.
const SKIP_HEADERS = new Set(["host", "connection", "keep-alive", "transfer-encoding", "content-length"]);

// The env the handlers see: only the variables the Pages function would have,
// never the whole process environment.
export function envFrom(source = process.env) {
  const env = {};
  for (const key of ENV_KEYS) if (source[key]) env[key] = source[key];
  return env;
}

// Node's IncomingMessage as a web Request. The URL is rebuilt from the Host
// header, so the descriptor's links name the address the caller used.
export function toRequest(req, port = PORT) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);
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

// A web Response written to Node's ServerResponse.
export async function writeResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}

export async function handle(req, res, env) {
  try {
    await writeResponse(await handleRequest(toRequest(req), env), res);
  } catch (_) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ detail: "internal error", error: "internal_error" }));
  }
}

export function createServer(env = envFrom()) {
  return http.createServer((req, res) => handle(req, res, env));
}

// Started directly: serve. Imported (by the tests): export only.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const env = envFrom();
  createServer(env).listen(PORT, HOST, () => {
    // What is configured, never the values.
    console.log(`sandbox source listening on http://${HOST}:${PORT}${PREFIX}`);
    console.log(`  sandbox origin:     ${env.LIFECAREID_SANDBOX_ORIGIN || "(unset: data routes answer 503)"}`);
    console.log(`  client credentials: ${env.LIFECAREID_SANDBOX_SOURCE_CLIENT_ID && env.LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET ? "present" : "absent"}`);
  });
}
