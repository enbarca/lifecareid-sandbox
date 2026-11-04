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

Each registers a sandbox client and a synthetic person at run time, and deletes
the client at the end. Neither prints a secret: codes and tokens are cut to ten
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
walks a caller through it: the 401 and the metadata that lead to the sandbox, a
read under a grant with its receipt in the person's ledger, the 403 step-up for
a scope the token does not cover, a token issued to a client the server does not
accept, the person's revoke, and the refusal at the very next request.

One difference from the client example: the grant here is made through the
sandbox's API path (steps 3 and 4 of the sandbox guide), not through the
authorization code flow. The hosted sandbox issues authorization-code tokens
only for the resources it lists, and a server on your machine is not one of
them. The token is the same kind, single scope and short lived; it has no
audience, which the server accepts. The tests cover the audience check against
a double of the sandbox. The kit's Compose file is not used by either example: the server half runs in
this process, which is the natural runtime for a library, and the client half
cannot read from the Compose source, because the hosted issuer refuses a
loopback resource at `/authorize` for the same reason.

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
