// Cloudflare Pages Function: everything under /sandbox-source/ on the Pages
// site. The sandbox synthetic source, a zero-PHI reference data source for the
// LifeCare.ID sandbox and a TEST FIXTURE
// (https://developers.lifecare.id/sandbox-data-source).
//
// It runs on the edge, away from the sandbox's own host, so it keeps answering
// while that host moves. All behaviour lives in source/source.js; this file
// only mounts it. In the hosted deployment the import below points at the same
// module from wherever the site keeps it (see ../../README.md).
//
// Pages project variables: LIFECAREID_SANDBOX_ORIGIN, the sandbox's public
// origin (no trailing path), and the source's own client credentials,
// LIFECAREID_SANDBOX_SOURCE_CLIENT_ID and LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET.
// With the origin unset, the data routes answer 503 rather than serving
// anything unchecked.
import { handleRequest } from "../../../source/source.js";

export async function onRequest({ request, env }) {
  return handleRequest(request, env);
}
