# The public contract

## `openapi.json`

The API of a LifeCare.ID® instance, as the hosted sandbox and production serve
it. It is a copy for convenience; the file at
`https://developers.lifecare.id/openapi.json` is the authority.

Copy in this folder: **version 0.26.0**, 48 paths, taken from the upstream contract at commit `d695a3c2ab99` of 2026-11-04.

The hosted contract is 0.27.0, and its published file differs from this copy by
the version number only (the sandbox-only routes are not in it); the next sync
brings the line above up to date.

The copy is refreshed when the kit is. A maintainer with the lifecareid checkout
runs `scripts/sync-upstream.mjs`, which copies the contract at the commit it
syncs from and rewrites the line above (see "Keeping in step with upstream" in
the [kit README](../README.md)). A reader without the checkout can refresh it
by hand:

```bash
curl -sS https://developers.lifecare.id/openapi.json -o contract/openapi.json
python3 -c 'import json; print(json.load(open("contract/openapi.json"))["info"]["version"])'
```

The four sandbox-only routes (`POST /v1/sandbox/clients`,
`GET /v1/sandbox/clients/{client_id}`, `DELETE /v1/sandbox/clients/{client_id}`,
`POST /v1/sandbox/test-identity`) are not in the contract: a production instance
answers them `404`. Since 2026-11-04 (hosted 0.27.0) the `POST` takes
`resources`, one to five addresses of your own servers that a token may be
issued for. They are
documented at
[developers.lifecare.id/sandbox](https://developers.lifecare.id/sandbox).
The source's own routes (`/sandbox-source/...`) are not in it either, nor is
the protected resource metadata route
(`/.well-known/oauth-protected-resource/sandbox-source/mcp`): the source is a
resource server, not the identity server, and its reference is
[developers.lifecare.id/sandbox-data-source](https://developers.lifecare.id/sandbox-data-source).

## `server.json`

The MCP Registry entry for the hosted source's MCP face, in the
[`server.json` format](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md)
(schema 2025-12-11): a remote-only server, streamable HTTP at
`https://lifecare.id/sandbox-source/mcp`, with the `Authorization` header
marked required and secret. The `version` follows `VERSION` in
`source/source.js`.

### Namespace

The name is `id.lifecare/sandbox-source`: the reverse-DNS form of `lifecare.id`,
which the registry grants only to a publisher who proves control of that
domain. The registry verifies the namespace, not the remote URL, so a name on
the same domain as the endpoint is what lets a reader see that both belong to
the same publisher. Two ways to prove it, either one:

- **DNS:** a TXT record on the apex `lifecare.id` (not under a selector) of the
  form `v=MCPv1; k=ed25519; p=<public key>`, then
  `mcp-publisher login dns --domain lifecare.id --private-key <key>`.
- **HTTP:** the same `v=MCPv1; k=ed25519; p=<public key>` line served at
  `https://lifecare.id/.well-known/mcp-registry-auth`, then
  `mcp-publisher login http --domain lifecare.id --private-key <key>`.

Then, from this folder, `mcp-publisher publish`. The key is the domain
owner's and is not in this repository. Until that proof is in place the entry
can be published under the GitHub namespace instead (`io.github.enbarca/...`),
which proves control of the GitHub account and nothing about the domain; the
file is written for the domain namespace on purpose.

Each remote URL may be used by one server name only.
