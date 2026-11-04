# The public contract

## `openapi.json`

The API of a LifeCare.ID® instance, as the hosted sandbox and production serve
it. Fetched from `https://developers.lifecare.id/openapi.json` on 2026-10-06:
**version 0.24.1**, 48 paths. It is a copy for convenience; the file at that
address is the authority, and this copy is refreshed when the kit is:

```bash
curl -sS https://developers.lifecare.id/openapi.json -o contract/openapi.json
python3 -c 'import json; print(json.load(open("contract/openapi.json"))["info"]["version"])'
```

The three sandbox-only routes (`POST /v1/sandbox/clients`,
`DELETE /v1/sandbox/clients/{client_id}`, `POST /v1/sandbox/test-identity`) are
not in the contract: a production instance answers them `404`. They are
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
