// Cloudflare Pages Function: everything under /sandbox-source/ on the Pages
// site. The sandbox synthetic source, a zero-PHI reference data source for the
// LifeCare.ID sandbox and a TEST FIXTURE
// (https://developers.lifecare.id/sandbox-data-source).
//
// It runs on the edge, off the node, so it keeps answering while the node moves.
// All behaviour lives in the source module; this file only mounts it.
//
// Pages project variables, all read by the module this file mounts:
//   LIFECAREID_SANDBOX_ORIGIN               the sandbox's public origin (no
//                                           trailing path)
//   LIFECAREID_SANDBOX_SOURCE_CLIENT_ID     the source's own client credentials at
//   LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET the sandbox, presented to introspect
//                                           a token and to record an access
// Without the origin the data routes answer 503 rather than serving anything
// unchecked.
import { handleRequest } from "../../../source/source.js";

export async function onRequest({ request, env }) {
  return handleRequest(request, env);
}
