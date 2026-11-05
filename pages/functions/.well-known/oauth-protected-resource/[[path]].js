// Cloudflare Pages Function: /.well-known/oauth-protected-resource/... on the
// Pages site. OAuth 2.0 Protected Resource Metadata (RFC 9728) for the sandbox
// source's MCP endpoint, https://lifecare.id/sandbox-source/mcp, so a client
// that follows the MCP authorization specification is led from the endpoint to
// the sandbox authorization server
// (https://developers.lifecare.id/sandbox-data-source, "Discovery"). All
// behaviour lives in the source module.
//
// A function, not a static file, because the document
// carries the sandbox origin from the Pages project variable
// LIFECAREID_SANDBOX_ORIGIN and names its own origin from the request, which a
// static file cannot do.
import { handleProtectedResourceMetadata } from "../../../../source/source.js";

export async function onRequest({ request, env }) {
  return handleProtectedResourceMetadata(request, env);
}
