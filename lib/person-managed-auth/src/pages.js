// Person-managed authorization, server half, for a Cloudflare Pages Function
// (draft 1).
//
//   // functions/api/[[path]].js
//   import { createResourceServer } from "@lifecareid/person-managed-auth/server";
//   import { pagesFunction } from "@lifecareid/person-managed-auth/pages";
//
//   export const onRequest = pagesFunction(
//     (env) => createResourceServer({
//       resource: "https://example.com/api/mcp",
//       authorizationServer: "https://sandbox.lifecare.id",
//       clientId: env.PMA_CLIENT_ID, clientSecret: env.PMA_CLIENT_SECRET,   // Pages secrets
//       scopes: ["daily"],
//     }),
//     async (request, { grant, receipt }) => ({ ... }),
//     { scope: "daily" });
//
// Mount the same function a second time at
// functions/.well-known/oauth-protected-resource/[[path]].js so the metadata
// answers at its well-known path. The first argument is a server or a
// function of `env` that builds one; building is cheap, and the secret stays
// in env.
export function pagesFunction(serverOrFactory, handler, options = {}) {
  return async function onRequest(context) {
    const server = typeof serverOrFactory === "function" ? serverOrFactory(context.env) : serverOrFactory;
    return server.fetchHandler(handler, options)(context.request, context);
  };
}
