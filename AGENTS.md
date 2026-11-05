# Instructions for a coding agent working in this repository

Written 2026-11-05, against the hosted sandbox at 0.27.2 and the source at 0.3.2.
For anything this file does not say, read the README of the folder you are in,
then `https://developers.lifecare.id/llms.txt` and
`https://developers.lifecare.id/openapi.json` (the authority for the API).

## What this kit is, and is not

The kit is a synthetic health-data source behind a real consent flow, the
contract it serves, a reference deployment, an example client, and a draft
library for person-managed authorization. Person-managed authorization is the
protocol: the person, not the agent or the server, decides what an agent may
read and can end it at any time. LifeCare.ID® is its first implementation.

- The identity server (identity, consent, tokens, the ledger) is not here and
  never will be. The kit works against the hosted sandbox at
  `https://sandbox.lifecare.id`. Do not write or suggest a stand-in for it.
- The Healthspan Node is a separate distribution, being released under the
  AGPL. It is not in this repository.
- The kit holds no secret and no name list. Never put a token, a client secret
  or a credential in any file, a log line, a commit message or a test.
- All data is synthetic. Do not add real health data or a real person.
- Say "person-managed authorization". Never frame it as "sign in with
  LifeCare.ID®". The licence covers the code, not the marks.

## Layout

| Folder | What it is |
|---|---|
| `source/` | the reference data source that runs at `https://lifecare.id/sandbox-source`: REST and MCP over the same handlers, the personas, and the tests with the sandbox mocked |
| `contract/` | `openapi.json`, a copy of the public contract, and `server.json` for the MCP Registry (hand-kept; its version follows `VERSION` in `source/source.js`) |
| `pages/` | the Cloudflare Pages Function wrappers that mount the source (`pages/functions/`) and their README |
| `compose/` | runs the source on your machine, checking tokens at the hosted sandbox with a client you registered |
| `examples/` | `run-loop.mjs`, the whole loop on the sandbox's API path; `person-managed-auth/` has one example per library half |
| `lib/person-managed-auth/` | the library, draft 1: client half and server half. Its README is the reference |
| `scripts/` | `sync-upstream.mjs`, a maintainer's tool |
| `sync/` | `map.json` (what maps to what) and `UPSTREAM` (the commit last synced from) |
| `tests/` | `brand.test.mjs` |

## Files you must not edit by hand

These are copies of files that live in the identity server's repository. A
hand edit is overwritten by the next sync and the kit then differs from what
runs at `https://lifecare.id/sandbox-source`.

- everything under `source/` (the code, `personas.generated.js`, `data/`, and
  both `*.test.mjs` files)
- everything under `pages/functions/`
- `contract/openapi.json`, and the line starting `Copy in this folder:` in
  `contract/README.md`
- everything under `sync/`

Do not run the sync. It reads a local checkout of the upstream repository and a
private names list, neither of which a contributor has; with no list it exits 1
and reads nothing. A maintainer runs it, then verifies it:

```bash
node scripts/sync-upstream.mjs --from <checkout> --ref <commit> --names-file <list>
node scripts/sync-upstream.mjs --from <checkout> --ref <commit> --names-file <list> --check
```

`--check` exits 0 when the kit is in step and 1 with a diff when it is not. If
a change belongs in one of those files, open an issue with the request shape
and the response, token left out, and say what the contract promised instead.
Everything else (the library, the examples, `compose/`, the READMEs, the tests
you add) is yours to change.

## Commands

Node 22 or newer. The kit has no dependencies; the library has one, the MCP SDK.

```bash
npm ci --prefix lib/person-managed-auth    # once; without it the library's client tests skip
node --test                                # from the kit root, no network
```

Against the hosted sandbox you need a developer access token from
`https://app.lifecare.id/devaccess`. Put it in the environment of the command
only. Never echo it, never write it to a file, and never print it in output.

```bash
LIFECAREID_DEVACCESS_TOKEN=... node examples/run-loop.mjs                       # the API path loop
LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/agent.mjs      # client half
LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/server.mjs     # server half
```

Each registers its clients and a synthetic person at run time and deletes the
clients at the end. A run closed the loop when its last line says so and the
exit code is 0. The source on your machine, `npm run source` or
`docker compose up` in `compose/`, needs a client you register first
(`compose/README.md`); read it against the loop with
`SOURCE=http://localhost:8799/sandbox-source node examples/run-loop.mjs`.

## Brand rules the brand test enforces

`tests/brand.test.mjs` reads the documents it lists and fails on:

- `LifeCare.ID` without the mark. Write `LifeCare.ID®` on every rendered line:
  documents, UI strings, alt text, error text you show. Code comments and code
  identifiers are exempt; `LIFECAREID_*` variable names are not the mark.
- an em dash or an en dash, anywhere in a document
- an exclamation point or an emoji in prose (code blocks and inline code are
  not prose)

Headings are in sentence case, as `CONTRIBUTING.md` asks; the test does not
check it, so you do. If you add a document, add it to the `DOCS` list in that
test.

## The library's rules

Reference: `lib/person-managed-auth/README.md`. Keep these when you change the
library, the examples, or an agent or server built on it.

1. One scope per token. A request for two is refused. Ask for one, and step up for the next.
2. A held credential goes only to the origin it was configured for: the client secret to `issuer`, the access token to `resource`, the developer access token to the sandbox. Discovery informs and never steers; a different issuer named by metadata stops the run.
3. Never render the person's yes. Hand over `ask.authorizeUrl`; the person answers on the authorization server's own origin. The examples use a synthetic session as a stand-in and say so where it happens.
4. A receipt is a consent id and a ledger hash. Hold no health value in a receipt or in the agent.
5. `grantees` is required on a server and has no default.
6. A server registers its canonical resource string (`pma.resource`) byte for byte: lower-case host, no default port, no trailing slash. The sandbox compares it exactly.
7. A single `tools/call` outside the token's scope is a transport `403` whose `WWW-Authenticate` names the scope; step up to that scope alone.
8. The SDK's `auth()` does not read the challenge. Go through the transport: connect first and let the `401` lead. Never call `auth()` directly.
9. A token lasts 1200 seconds with no refresh token; the library reports it ended and the next call asks again.
10. The stop never retries. A token refused after use is the person's stop: `PersonStopped`, the signal aborts, no request is made after it. Only `askAgain: true` asks again.

## Status

- The library is private and unpublished. Import it by relative path
  (`lib/person-managed-auth/src/client.js`, `server.js`, `node.js`, `pages.js`);
  the README's `@lifecareid/person-managed-auth/...` imports are for after
  publication.
- `source/` is at 0.3.2, the same as the hosted source: one scope named on
  every `401`, `WWW-Authenticate` exposed to a page on another origin, and a
  token with no audience refused.
- `contract/openapi.json` is 0.27.2, the version at the commit synced.
- Since 2026-11-05 the sandbox issuer answers a browser on another origin on
  five routes: the two discovery documents, the JWKS, `/token` and `/revoke`.
  Client registration and introspection still do not, so register the client
  from a script or a server, not from a page.
- Clients registered before the 0.27.0 deploy on 2026-11-04 carry no owner and
  cannot hold a resource; register new ones with your developer access token.
- The open agent authorization profile is planned for 2026-12-01 and not yet
  published. Shapes marked `profile draft 1 may change this` may change.

## Before you say you are done

1. `node --test` is green, the brand test included.
2. You ran the example you touched once against the hosted sandbox and its last
   line says the loop closed.
3. No secret, token or credential is in any file or in your output.
4. You edited none of the files the sync owns.
5. You say what you ran and what you did not.
