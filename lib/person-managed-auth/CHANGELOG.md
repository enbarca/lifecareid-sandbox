# Changelog

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
