# Examples: person-managed authorization

Two runnable examples of the library in
[`lib/person-managed-auth/`](../../lib/person-managed-auth/) (draft 1), one per
half, against the hosted sandbox. Each closes the loop with a synthetic person:
discover, the person grants, read, the receipt, the person revokes, the next
read is refused. They live here, beside the kit's other example, and import the
library from its folder. Node 22 or newer.

## Run them

1. Get a developer access token at
   [app.lifecare.id/devaccess](https://app.lifecare.id/devaccess).
2. Install the one dependency once: `npm ci --prefix lib/person-managed-auth`.
3. Run either:

```bash
LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/agent.mjs
LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/server.mjs
```

Each registers sandbox clients and a synthetic person at run time, and deletes
the clients at the end. The server example needs the hosted sandbox at 0.27.0 or later. Neither prints a secret: codes and tokens are cut to ten
characters.

## The client half, `agent.mjs`

An agent reads from the sandbox's synthetic MCP source at
`https://lifecare.id/sandbox-source/mcp`. It follows the server's challenge to
the sandbox, stops at the person, takes the callback, reads, shows the receipt,
steps up to a second scope when the server says so (set `STEP_UP=0` to skip),
and stops when the person revokes. The last lines show the stop: the read after
the revoke fails with `PersonStopped`, `agent.stopped` is aborted, and a second
call makes no request at all.

The person's yes is the one stand-in. A real agent hands the person the
authorize URL and takes back what they send. Here a synthetic identity's
session cookie fetches the grant page on the sandbox origin and posts the yes,
the way the sandbox walkthrough does in place of the passkey tap. The library
never renders it. The revoke is the data-rights panel's API.

## The server half, `server.mjs`

The process runs a small MCP server on your machine, `synthetic-mcp.mjs`, that
holds one synthetic fact and serves it through the library's server half, then
walks a caller through the whole flow: the 401 and the metadata that lead to the
sandbox, the authorization code flow with the server as the resource, a read
under the grant with its receipt in the person's ledger, the 403 step-up for a
scope the token does not cover (the caller asks for that scope alone), a token
issued to a client the server does not accept, the person's revoke, and the
refusal at the very next request.

How a server on your machine takes part. The hosted sandbox at 0.27.0 or later
accepts, as the `resource` of an `/authorize` request, an address that a client of
yours registered with `resources` on `POST /v1/sandbox/clients`. So the example
listens first (its port is chosen by the system), computes its resource string
the way the library compares it, `pma.resource`, and registers that exact string
on its own client. The caller is a second client, registered with the same
developer access token, and the token it gets has the server's loopback URL as
its `aud`, which the server checks against the real issuer. The person's yes is
the one stand-in, as in the client example.

Two things to get right when you do this in your own server:

- Register the string the library holds, byte for byte. The library lower-cases
  the host and drops a default port and a trailing slash, and the sandbox
  compares the stored string exactly, so `http://LOCALHOST:8787/mcp` or
  `http://127.0.0.1:8787/mcp/` registers and then never matches. The example
  asserts `pma.resource` equals what it registered.
- Clients registered before 2026-11-04 carry no owner and cannot hold or use a
  resource on the hosted sandbox. Register new ones with your developer access
  token, as the examples do at run time.

Another developer can register the same address on their own clients and obtain
a token whose `aud` is your server, so your server still decides which clients it
accepts, by the token's grantee (`grantees`, required). The example's third
client shows the refusal: the same developer's other client may ask for the
resource, and the server turns its token away.

The example no longer uses the sandbox's API path (steps 3 and 4 of the sandbox
guide) and has no fallback to it. Against a sandbox older than 0.27.0 the
registration of `resources` is refused or `/authorize` answers `invalid_target`,
and the example says so and stops. A local sandbox you run yourself has no
developer gate and so no owners: a resource registered on any of its clients is
accepted. The kit's Compose file is not used by either example: the server half
runs in this process, which is the natural runtime for a library, and the client
example reads from the hosted source.

The examples import the library from its folder, by relative path, because the
package is unpublished. Once it is, the imports in the README's snippets
(`@lifecareid/person-managed-auth/client` and `/server`) are the ones to use.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `LIFECAREID_DEVACCESS_TOKEN` | none | your developer access token. It goes only to `SANDBOX` |
| `SANDBOX` | `https://sandbox.lifecare.id` | the sandbox origin (https, or http on loopback) |
| `RESOURCE` | `https://lifecare.id/sandbox-source/mcp` | `agent.mjs` only: the MCP endpoint to read |
| `STEP_UP` | on | `agent.mjs` only: `0` skips the second scope |
