// @lifecareid/person-managed-auth: person-managed authorization, draft 1.
// Both halves. The subpath exports load one half each:
//   /server and /node and /pages need no dependency;
//   /client uses the official MCP SDK.
export * from "./client.js";
export * from "./server.js";
export { nodeHandler } from "./node.js";
export { pagesFunction } from "./pages.js";
