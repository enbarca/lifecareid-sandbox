# LifeCare.ID® sandbox kit

A synthetic health-data source behind a real consent flow. Run the whole loop
on your machine or against the hosted sandbox: register an app, mint a
synthetic person, grant a scope, get a token, read, see the read in the
person's ledger, revoke, and watch the next read fail.

Everything here is a test fixture. Five synthetic personas, interpreted outputs
only (scores, bands, directions, dates, authored sentences), zero PHI, no
person. It exists so that an app, an agent, or the gateway in front of an agent
can be exercised against something that behaves the way a conforming data
source must, before a real one is involved.

## What this is

| Folder | What it holds |
|---|---|
| [`source/`](source/) | the reference data source, the code that runs at `https://lifecare.id/sandbox-source`. On every request it introspects the bearer token at the sandbox with its own client credentials, enforces scope and resource owner, writes the access to the owner's ledger, then serves. REST and MCP over the same handlers, and the tests, with the sandbox mocked |
| [`contract/`](contract/) | the public API contract (`openapi.json`, version in the README there) and `server.json` for the MCP Registry |
| [`pages/`](pages/) | the reference deployment, a Cloudflare Pages Function, with the two project variables it reads and the rule for the one secret |
| [`compose/`](compose/) | `docker compose up` runs the published sandbox image `ghcr.io/enbarca/lifecareid:sandbox` beside the source, on your machine, with no account and no gate |
| [`examples/`](examples/) | one client that runs the full loop and checks every answer, against the hosted sandbox or your local one |

## What this is not

The identity server itself (identity, consent, tokens, the ledger: lifecare.id)
is not open source and is not in this repository. What the kit publishes is
what you need to build and test against it: the source, the contract, the
reference deployment, and a runnable image of the server in sandbox mode. The
image is the same binary that runs in production; `LIFECAREID_SANDBOX=true` in
its environment is what opens the self-service routes. There is no
sandbox-specific build.

## Quick start

### Hosted, in five minutes

1. Get a developer access token at
   [app.lifecare.id/devaccess](https://app.lifecare.id/devaccess): your email,
   the terms, a magic link. The verify page shows the token.
2. Run the loop:

```bash
LIFECAREID_DEVACCESS_TOKEN=... node examples/run-loop.mjs
```

3. Read the output: one line per step, the persona your synthetic person maps
   to, the ledger line the read produced, and the two `401`s after revocation.

The same steps as copy-and-paste `curl` are the walkthrough at
[developers.lifecare.id/sandbox-data-source.html](https://developers.lifecare.id/sandbox-data-source.html).

### Local, with compose

```bash
cd compose && docker compose up
# in another shell
SANDBOX=http://localhost:8821 SOURCE=http://localhost:8799/sandbox-source node examples/run-loop.mjs
```

[compose/README.md](compose/README.md) has the walkthrough against localhost
and explains how the two containers are wired.

## Try to break it

The source is published so that people can test it, not only use it. Two
things worth trying first:

- **Read a scope you were not granted.** Hold a token for `recovery` and ask
  for `cgm`. The contract says `403 insufficient_scope`, and nothing is written
  to the ledger.
- **Replay a revoked token.** Revoke the grant and present the same token
  again, over REST and over any MCP method, `initialize` and `tools/list`
  included. The contract says `401 invalid_token`, on the very next call.

Found a hole, in the source or in what the sandbox lets it do? Open an issue
here with the request shape and the response. Leave the token out. A finding
in the identity server is handled from here too; it moves upstream.

## Tests

```bash
node --test
```

Node 22 or newer, no dependencies. The source tests mock the sandbox and check
what the source does with each answer it can get; the adapter tests check the
local runtime; the brand test keeps the documents to the rules below.

## Links

- Developer documentation: [developers.lifecare.id](https://developers.lifecare.id)
- The paper: [lifecare.id/paper](https://lifecare.id/paper)
- The sandbox and its data source: [sandbox](https://developers.lifecare.id/sandbox.html), [sandbox data source](https://developers.lifecare.id/sandbox-data-source.html)

## Licence and trademark

The code in this repository is licensed under the Apache License, version 2.0
([LICENSE](LICENSE), [NOTICE](NOTICE)). LifeCare.ID® is a registered trademark
of Enbarca Inc dba HCVC.net and is not licensed by this repository or by the
Apache License (its section 6 grants no trademark rights). You may run, modify
and redistribute the code; you may not present your own service as
LifeCare.ID®.
