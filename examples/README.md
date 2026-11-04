# Example client: the whole loop

`run-loop.mjs` runs every step of the sandbox walkthrough in one go and checks
each answer against the contract: discovery, register, mint, grant, token, REST read, a
refused read of an ungranted scope, MCP read, ledger, revoke, the replay of the
revoked token on both faces, and the client's deletion. Node 22 or newer, no
dependencies.

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
called. The sandbox comes from `authorization_servers[0]` when `SANDBOX` is not
set. When `SANDBOX` is set the client keeps it and says whether the metadata
agrees. The sandbox registration, the synthetic person, the grant and the token
that follow are unchanged; the authorization code flow a client would run
against that sandbox is not in this example.

## What it prints

One line per step with the status and what matters from the answer: the
challenge and the metadata it points to, the sandbox taken from it, the
client id, the synthetic DID, the consent id, the persona the DID maps to and
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
