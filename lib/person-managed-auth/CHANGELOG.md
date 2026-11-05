# Changelog

## Every 401 names the one scope (2026-11-05)

Server half. Every `401` challenge now carries `scope`, the one scope the server
suggests: the scope the request was for when the server passes it (`scope` or the
new `suggest` option of `authenticate`, which an MCP server uses to name the scope
of a `tools/call` before it has authenticated), otherwise the server's default
`scope`. Before, a `401` for a presented token (expired, revoked, for another
resource) carried `error="invalid_token"` and no scope, so a stock client that
reconnected asked for every scope in the metadata and the issuer refused. `error`
and the body are unchanged. The synthetic MCP example passes `suggest`.

## Examples, after hosted sandbox 0.27.0 (2026-11-04)

No change to the library. The server example now lists first, registers its
canonical resource string (`pma.resource`) on its own client with `resources`,
registers the caller as a second client under the same developer access token,
and takes its grant through the authorization code flow: the token's `aud` is
the server's loopback URL, so the audience check runs against the real issuer
and not a double. The walkthrough path (`/v1/consent/grant`, `/v1/token`) is no
longer used by it. The sentence that the hosted sandbox refuses a loopback
resource is no longer true as of hosted sandbox 0.27.0: a developer registers
it. Register the string the library holds, byte for byte; clients registered
before 2026-11-04 carry no owner and cannot hold a resource.

## 0.1.0, draft 1 (unreleased, private)

First build. Every shape follows what the hosted sandbox does on 2026-11-04,
because the open agent authorization profile is not yet published (planned
2026-12-01). Where draft 1 of the profile defines a shape, this library follows
the draft and says so here. Each of these is marked `profile draft 1 may change
this` in the code:

- The receipt: `consent_id`, `access_recorded` and `ledger_entry_hash` in the
  body of the answer to a read (the sandbox source's shape). The profile's
  MCP-10 defines the receipt as the consent id and the hash of the write-ahead
  access line.
- The 401 challenge: `resource_metadata`, and the one `scope` the server
  suggests while no token was presented.
- The 403 step-up: `error="insufficient_scope"`, the `scope` the call asked for,
  and `resource_metadata`.
- Refusals as `{ detail, error }`.
- The grantee as the `requester` the introspection names. `grantees` is a
  required option on the server with no default (`"any"`, a list, a function or
  `"own"`): each default is wrong for half of servers.
- The introspection and ledger-write paths under the issuer.
- The `purpose` parameter of the authorization request.
- One scope per token, and the step-up replacing the held token.

Client half: a registered confidential client only. No dynamic registration code
path. Public clients and Client ID Metadata Documents are the profile's.
