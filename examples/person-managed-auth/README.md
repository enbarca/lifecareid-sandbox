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
the clients at the end. The server example needs the hosted sandbox at 0.27.0 or
later. Neither prints a secret: codes and tokens are cut to ten characters.

Each takes about five seconds of machine time against the hosted sandbox
(measured 2026-11-04). The reading takes longer; a cold reader took ten to twenty
minutes for both. Wiring the client half into your own agent, with a redirect
receiver, is the afternoon.

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

A real agent needs a redirect receiver at its registered redirect URI, which is
what takes the place of that stand-in; see
[the redirect receiver](../../lib/person-managed-auth/README.md#the-redirect-receiver)
in the library README.

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

## The same loop in a browser page

`page/` runs the loop in a browser, as a web app of your own would. It is plain
HTML and JavaScript with no build step, and a small Node backend beside it. The
backend is needed because a sandbox client registered the classic way is
confidential: its secret stays on a server, so the page posts the code to the
backend and the backend exchanges it. The secret and the token never reach the
page, and the page shows them cut to ten characters.

Prerequisites: Node 22 or newer and a developer access token from
[app.lifecare.id/devaccess](https://app.lifecare.id/devaccess). The page needs
no `npm ci`; it imports only the library's helper functions.

```bash
LIFECAREID_DEVACCESS_TOKEN=... npm run page
# open http://127.0.0.1:4000
```

Open it at `127.0.0.1`, not `localhost`: the redirect address registered at the
sandbox is the loopback one. Press Ctrl-C when you are done; the backend deletes
the client it registered. With the source on your machine as well, from `compose/`:
`LIFECAREID_DEVACCESS_TOKEN=... docker compose --profile page up`.

What the browser shows, step by step:

1. **Discovery.** The page fetches the source's protected-resource metadata and
   then the issuer's metadata it names, both from the browser (the sandbox
   issuer and the synthetic source answer browser origins).
2. **The challenge.** A request with no token gets a `401`; the page prints the
   `WWW-Authenticate` header, which names the metadata and the scope to ask for.
3. **The person's yes.** The page builds the authorization request with a PKCE
   challenge and the source as the resource, and prints it. The backend then
   gives the yes as the synthetic person, which it minted at start (its
   identifier is at the top of the page), and the browser receives the redirect
   with the code in a hidden frame. This is the one stand-in; a real person taps a
   passkey on the LifeCare.ID® origin.
4. **The exchange.** The page posts the code and its PKCE verifier to the
   backend, which adds the client secret and calls the token endpoint. The page
   shows the token cut to ten characters, its type, lifetime and scope.
5. **The read.** The backend reads the source with the token. The page shows the
   synthetic data and the receipt: `consent_id`, `ledger_entry_hash` and
   `access_recorded`, with the line the source wrote in the person's ledger. Then
   the revoke button has the person revoke the grant, and the next read is
   refused with a `401`.

The backend answers five calls for the page, all on the page's own origin:
`GET /api/config`, `POST /api/yes`, `POST /api/exchange`, `POST /api/read` and
`POST /api/revoke`. It refuses a request from another origin, and it gives the
yes only at the sandbox origin.

To point the page at a client of your own instead of the one the backend
registers, change `register()` in `page/server.mjs` to set `held.client` to your
client's id and secret and to register your redirect address, and set `SOURCE`
to your own protected resource. A source other than the hosted one is registered
as a `resource` on the client, as `server.mjs` does. In your own app the person
signs in with a passkey in place of the stand-in, and the redirect receiver is
`page/callback.js`. The sandbox also takes public clients by client-ID metadata
document; a version of this page that uses one, and so needs no secret on a
backend, is planned. A client that has a secret keeps its exchange on a backend.

Page settings, all environment variables: `LIFECAREID_SANDBOX_ORIGIN` (default
`https://sandbox.lifecare.id`), `SOURCE` (default `https://lifecare.id/sandbox-source`),
`SOURCE_FETCH` (where the backend reaches the same source when the browser's
address does not work from inside a container), `SCOPE` (default `daily`), `PORT`
and `HOST` (default `4000` and `127.0.0.1`).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `LIFECAREID_DEVACCESS_TOKEN` | none | your developer access token. It goes only to `SANDBOX` |
| `SANDBOX` | `https://sandbox.lifecare.id` | the sandbox origin (https, or http on loopback) |
| `RESOURCE` | `https://lifecare.id/sandbox-source/mcp` | `agent.mjs` only: the MCP endpoint to read |
| `STEP_UP` | on | `agent.mjs` only: `0` skips the second scope |
