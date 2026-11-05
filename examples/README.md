# Example client: the whole loop

`run-loop.mjs` runs every step of the sandbox walkthrough in one go and checks
each answer against the contract: discovery, register, mint, grant, token, REST read, a
refused read of an ungranted scope, MCP read, ledger, revoke, the replay of the
revoked token on both faces, and the client's deletion. Node 22 or newer, no
dependencies. It takes its token through the authorization code flow, with the person's
yes given through the synthetic session cookie, so no browser is needed; only
the grant uses the session API. The client it registers names the source as a
resource, so the token carries that audience. The agent flow a real client
runs, with the person's own yes, is in [`person-managed-auth/`](person-managed-auth/).

## Against the hosted sandbox

1. Get a developer access token at
   [app.lifecare.id/devaccess](https://app.lifecare.id/devaccess): your email,
   the terms, a magic link. The verify page shows the token.
2. Run it:

```bash
LIFECAREID_DEVACCESS_TOKEN=... node examples/run-loop.mjs
```

## Against the source on your machine

With `compose/` up (see [compose/README.md](../compose/README.md)), the same
run with the source reads pointed at localhost. Identity, consent and tokens
still come from the hosted sandbox, so the developer access token is still
needed:

```bash
LIFECAREID_DEVACCESS_TOKEN=... SOURCE=http://localhost:8799/sandbox-source node examples/run-loop.mjs
```

`SANDBOX` overrides the sandbox origin too (an `https` origin, or plain
`http` on loopback), for anyone who operates a sandbox instance of their own.

## Discovery first

Before it asks the sandbox for anything, the client sends one MCP request to
`${SOURCE}/mcp` with no token and expects `401`. It reads `resource_metadata`
from the `WWW-Authenticate` challenge, fetches that document (OAuth protected
resource metadata, RFC 9728) and checks that its `resource` is the endpoint it
called. It then compares the sandbox the document names, `authorization_servers[0]`,
with the sandbox the run will use.

The developer access token is a credential for one issuer, so it goes only to
`https://sandbox.lifecare.id` (the default) or to the origin you set as
`SANDBOX`, never to a server a source's metadata names. When the document names
the sandbox in use, the run goes on. When it names another one and `SANDBOX` is
not set, the run stops with exit 1 before it sends anything, and tells you the
origin to set as `SANDBOX` if you trust it. When `SANDBOX` is set and the
document names another, the run says so and keeps the one you set. The sandbox
registration, the synthetic person, the grant and the token that follow are
unchanged. The authorization code flow a client runs against that sandbox is
not in this example. It is in
[`person-managed-auth/agent.mjs`](person-managed-auth/agent.mjs) and described
at [developers.lifecare.id/sandbox-data-source](https://developers.lifecare.id/sandbox-data-source#discovery).

## What it prints

One line per step with the status and what matters from the answer: the
challenge and the metadata it points to, whether it agrees with the sandbox in
use, the client id, the synthetic DID, the consent id, the persona the DID maps to and
how it was selected, the band it reports, whether the access was recorded, the
ledger counts and the latest ledger line, and the two `401`s after revocation,
each with the `error` its challenge carries.
It exits 0 when every step answered as the contract says and 1 otherwise.

It never prints a secret: not the developer access token, not the client
secret, not the session token, not the data-access token.

## Choosing a persona

Set `PURPOSE="agent governance pilot persona:p5-glucose-anomaly"` to pin a
persona. The pin lives in the purpose the synthetic person consents to, so it
is set on the grant and the token, never per request.
