# LifeCare.ID® sandbox kit

A synthetic health-data source behind a real consent flow. Run the whole loop
against the hosted sandbox, with the source hosted or on your machine:
register an app, mint a synthetic person, grant a scope, get a token, read,
see the read in the person's ledger, revoke, and watch the next read fail.

Everything here is a test fixture. Five synthetic personas, interpreted outputs
only (scores, bands, directions, dates, authored sentences), zero PHI, no
person. It exists so that an app, an agent, or the gateway in front of an agent
can be exercised against something that behaves the way a conforming data
source must, before a real one is involved.

## What is in it

| Folder | What it holds |
|---|---|
| [`source/`](source/) | the reference data source, the code that runs at `https://lifecare.id/sandbox-source`. On every request it introspects the bearer token at the sandbox with its own client credentials, enforces scope and resource owner, writes the access to the owner's ledger, then serves. REST and MCP over the same handlers, the protected resource metadata that leads a client to the sandbox, and the tests, with the sandbox mocked |
| [`contract/`](contract/) | the public API contract (`openapi.json`, version in the README there) and `server.json` for the MCP Registry |
| [`pages/`](pages/) | the reference deployment, a Cloudflare Pages Function, with the two project variables it reads and the rule for the one secret |
| [`compose/`](compose/) | `docker compose up` runs the source on your machine, checking every token at the hosted sandbox with a client you registered there yourself |
| [`examples/`](examples/) | one client that runs the full loop and checks every answer, against the hosted source or the one on your machine; and, in `examples/person-managed-auth/`, one example per half of the library below |
| [`lib/person-managed-auth/`](lib/person-managed-auth/) | person-managed authorization for agents and the servers they read from, draft 1: a client half that asks the person once, keeps the receipt and stops at the person's stop, and a server half that names the authorization server, checks the grant at every request and writes the receipt. LifeCare.ID® is its first implementation. Private and unpublished until the name is confirmed |

## What this is, and what it is not

This kit is the synthetic data source, the contract it serves, a reference
deployment of it and an example client, under Apache-2.0. You can read it,
run it, test against it and change it.

The LifeCare.ID® identity origin (identity, consent, tokens, the ledger) is
not part of it and is not available to run elsewhere. Sandbox mode is a
runtime flag on the production binary, not a separate build, so a copy of the
server in sandbox mode would be the production identity server, and none is
published, as an image or otherwise. The hosted sandbox at
`https://sandbox.lifecare.id` is the identity origin the kit works against.

The Healthspan Node, the personal node people will be able to run on their
own hardware, is a separate distribution under AGPL-3.0, coming after a
publication audit. It is not in this repository either.

The marks are not licensed. LifeCare.ID® is a registered trademark; see the
licence section below.

## Quick start

### Hosted, in five minutes

1. Get a developer access token at
   [app.lifecare.id/devaccess](https://app.lifecare.id/devaccess): your email,
   the terms, a magic link. The verify page shows the token.
2. Run the loop:

```bash
LIFECAREID_DEVACCESS_TOKEN=... node examples/run-loop.mjs
```

3. Read the output: the discovery steps first (the source's challenge and the
   metadata it points to), then one line per step, the persona your synthetic
   person maps to, the ledger line the read produced, and the two `401`s after
   revocation.

The same steps as copy-and-paste `curl` are the walkthrough at
[developers.lifecare.id/sandbox-data-source](https://developers.lifecare.id/sandbox-data-source).

### The source on your machine

The same loop, with the two source reads going to a source you run. It checks
tokens at the hosted sandbox with its own client, one you register there with
the developer access token and put in `compose/.env`:

```bash
cd compose && cp .env.example .env   # fill in SOURCE_CLIENT_ID and SOURCE_CLIENT_SECRET
docker compose up
# in another shell
LIFECAREID_DEVACCESS_TOKEN=... SOURCE=http://localhost:8799/sandbox-source node examples/run-loop.mjs
```

[compose/README.md](compose/README.md) has the registration step, the
walkthrough by hand and how the container is wired.

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

## Discovery

A client does not have to be told where the sandbox is. The source publishes
OAuth 2.0 protected resource metadata (RFC 9728) for its MCP endpoint, at
`/.well-known/oauth-protected-resource/sandbox-source/mcp` on the host that
serves it, so on the hosted source:

```bash
curl -s https://lifecare.id/.well-known/oauth-protected-resource/sandbox-source/mcp
```

The document names the endpoint (`resource`), the sandbox that issues its
tokens (`authorization_servers`), the scopes the source understands and the
documentation. The same URL comes back in the challenge of a `401`: an MCP
request with no token answers `WWW-Authenticate: Bearer resource_metadata="...", scope="daily"`,
naming the one scope to ask for, and a request with a token the sandbox refuses
adds `error="invalid_token"` and no scope. A
client that follows the MCP authorization specification is therefore led from
the endpoint to the sandbox without being told. The example client follows the
same path before it asks for anything: it sends one request with no token,
reads the challenge, fetches the document, checks that `resource` is the
endpoint it called, and compares `authorization_servers` with the sandbox it
will use. It never sends your developer access token to a server it was not
told about: the token goes to `https://sandbox.lifecare.id` or to the origin
you set as `SANDBOX`, and a source that names another sandbox stops the run
before anything is sent.

The source on your machine publishes its own document the same way, naming its
own address as the resource and the sandbox in `LIFECAREID_SANDBOX_ORIGIN` as
the authorization server. The words are in the
[sandbox data source reference](https://developers.lifecare.id/sandbox-data-source).

## Keeping in step with upstream

For maintainers. The source, its personas and data, the two Pages Functions,
the two handler test files and the contract are copies of files that live in
the LifeCare.ID® repository. `scripts/sync-upstream.mjs` makes the copy
mechanical: it reads each file from a local checkout of that repository at a
commit you name, applies the few literal substitutions recorded in
`sync/map.json` (repository paths in comments become public URLs, import paths
become the kit's), and writes the kit files. The commit it synced from is
written to `sync/UPSTREAM`: the full commit and its date.

```bash
node scripts/sync-upstream.mjs --from /path/to/checkout --ref <commit> --names-file /path/to/names.txt
node scripts/sync-upstream.mjs --from /path/to/checkout --ref <commit> --names-file /path/to/names.txt --check
```

The names file is the program's private names list, one name per line, the
same file its own names gate reads; `NAMES_GATE_FILE` can name it instead of
the flag. This repository holds no names, and the script has no default path:
with no list it exits 1 without reading or writing anything, in both forms. A
maintainer passes the list; a contributor without it cannot run a sync.

The second form writes the same files to a temporary directory and diffs them
against this working tree: exit 0 when they are identical, exit 1 with the
diff when they are not. Run it to see drift, or to verify a sync. It needs the
private checkout, so it does not run in this repository's CI. The script
reads only from that commit (never from the checkout's working tree), reads
only four upstream directories, fetches nothing, and refuses to write when an
upstream file carries a name on the list, naming the file and line and never
the name. It also refuses to write through a symbolic link or into any `.git`
folder.

## Tests

```bash
node --test
```

Node 22 or newer. The kit itself has no dependencies. The source tests mock the
sandbox and check what the source does with each answer it can get; the adapter
tests check the local runtime and its metadata route; the brand test keeps the
documents to the rules in [CONTRIBUTING.md](CONTRIBUTING.md). The library's tests
run the official MCP SDK, its one dependency; install it once with
`npm ci --prefix lib/person-managed-auth`, and without it those tests skip with
the line that says so.

## Links

- Developer documentation: [developers.lifecare.id](https://developers.lifecare.id)
- The paper: [lifecare.id/paper](https://lifecare.id/paper)
- The sandbox and its data source: [sandbox](https://developers.lifecare.id/sandbox), [sandbox data source](https://developers.lifecare.id/sandbox-data-source)

## Licence and trademark

The code in this repository is licensed under the Apache License, version 2.0
([LICENSE](LICENSE), [NOTICE](NOTICE)). LifeCare.ID® is a registered trademark
of Enbarca Inc dba HCVC.net and is not licensed by this repository or by the
Apache License (its section 6 grants no trademark rights). You may run, modify
and redistribute the code; you may not present your own service as
LifeCare.ID®.
