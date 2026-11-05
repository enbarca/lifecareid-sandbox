# Run the source locally

One container: the synthetic data source, on your machine, checking every
token at the hosted sandbox, `https://sandbox.lifecare.id`. Identity, consent,
tokens and the ledger stay at the hosted sandbox; there is no identity server
in this kit and none to pull. What runs here is the code that runs at
`https://lifecare.id/sandbox-source`, with your own client credentials in
place of the hosted source's.

```bash
cd compose
cp .env.example .env     # then fill in the two values, as below
docker compose up
# source:   http://localhost:8799/sandbox-source
# sandbox:  https://sandbox.lifecare.id
```

## Before `docker compose up`: the source's own client

The source introspects every token at the sandbox, and the sandbox admits only
an authenticated client there (RFC 7662, section 2.1): the hosted source
presents its own client credentials, and so must yours. Any client the sandbox
knows will do, including one you register yourself through the sandbox's
self-service route. You need a developer access token for that:
[app.lifecare.id/devaccess](https://app.lifecare.id/devaccess), your email,
the terms, a magic link; the verify page shows the token.

```bash
DEVACCESS=...   # the token from https://app.lifecare.id/devaccess
curl -s -X POST https://sandbox.lifecare.id/v1/sandbox/clients \
  -H "Authorization: Bearer $DEVACCESS" -H "Content-Type: application/json" \
  -d '{"name":"My local source","redirect_uris":["http://localhost:8799/callback"]}'
# {"client_id":"sbx_...","client_secret":"...", ...}
```

Put the two values in `compose/.env` (git-ignored; `.env.example` is the
template):

```
SOURCE_CLIENT_ID=sbx_...
SOURCE_CLIENT_SECRET=...
```

Compose refuses to start without them, by design: a source without
credentials reaches the sandbox, is refused there, and answers
`503 source_not_authorized` to every read. The secret is shown once, at
registration; lose it and register another client. The client is yours to
delete, with its own credential:
`curl -X DELETE https://sandbox.lifecare.id/v1/sandbox/clients/$SOURCE_CLIENT_ID -u "$SOURCE_CLIENT_ID:$SOURCE_CLIENT_SECRET" -b "lc_dev=$DEVACCESS"`.

`GET http://localhost:8799/sandbox-source/` reports `configured: true` and
`client_credentials: true` when both are in place. It never reports the
values.

## The walkthrough, with the source on localhost

The same steps as the hosted walkthrough at
[developers.lifecare.id/sandbox-data-source](https://developers.lifecare.id/sandbox-data-source),
with the two source reads going to your machine. The example client runs them
in one go, with the same developer access token:

```bash
LIFECAREID_DEVACCESS_TOKEN=$DEVACCESS SOURCE=http://localhost:8799/sandbox-source node ../examples/run-loop.mjs
```

By hand:

```bash
SANDBOX=https://sandbox.lifecare.id
SOURCE=http://localhost:8799/sandbox-source
DEVACCESS=...

# 1. register the app's client (not the source's: the app is the one the
#    person grants access to)
curl -s -X POST "$SANDBOX/v1/sandbox/clients" -H "Authorization: Bearer $DEVACCESS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pilot agent","redirect_uris":["http://localhost:4000/callback"],"resources":["http://localhost:8799/sandbox-source/mcp"]}'
CLIENT_ID=sbx_...        # client_id from the response
CLIENT_SECRET=...        # client_secret from the response

# 2. mint a synthetic identity
curl -s -X POST "$SANDBOX/v1/sandbox/test-identity" -H "Authorization: Bearer $DEVACCESS" \
  -H "Content-Type: application/json" -d '{}'
DID=did:web:...                   # did from the response
SESSION=lcs_...                   # session_token from the response

# 3. the synthetic person grants your client two scopes
curl -s -X POST "$SANDBOX/v1/consent/grant" -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" -d '{
  "subject_did":"'"$DID"'","grantee":{"name":"Pilot agent","id":"'"$CLIENT_ID"'"},
  "scopes":["recovery","daily"],"purpose":{"text":"agent governance pilot"},"duration_days":1}'
CONSENT_ID=urn:lifecare:consent:...

# 4. a token for one scope, from the authorization code flow, as an app gets it in
#    production (POST /v1/token with a session is issued only against the person's
#    own grant). The client needs your source's address as a resource, and the
#    person's yes is given with the synthetic session cookie.
RESOURCE=http://localhost:8799/sandbox-source/mcp   # register it: "resources":["..."] in step 1's body
REDIRECT=http://localhost:4000/callback
COOKIE="__Host-lc_id_session=$SESSION"
VERIFIER=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')
CHALLENGE=$(printf %s "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
PAGE=$(curl -s -b "$COOKIE" "$SANDBOX/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT&state=s1&code_challenge=$CHALLENGE&code_challenge_method=S256&scope=recovery&resource=$RESOURCE")
ARGS=(); while read -r k v; do ARGS+=(--data-urlencode "$k=$v"); done < <(printf %s "$PAGE" | grep -o '<input type="hidden" name="[a-z_]*" value="[^"]*">' | sed 's/.*name="\([a-z_]*\)" value="\([^"]*\)">/\1 \2/')
CODE=$(curl -s -o /dev/null -D - -b "$COOKIE" "${ARGS[@]}" -d decision=approve "$SANDBOX/data-consent/decide" | sed -n 's/^[Ll]ocation: .*[?&]code=\([^&[:space:]]*\).*/\1/p')
curl -s -X POST "$SANDBOX/token" -d grant_type=authorization_code -d "code=$CODE" \
  -d "redirect_uri=$REDIRECT" -d "code_verifier=$VERIFIER" -d "resource=$RESOURCE" \
  -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET"
TOKEN=lc_...
# the grant the yes made has its own consent_id: introspect the token to read it
# (POST $SANDBOX/v1/token/introspect, -u "$CLIENT_ID:$CLIENT_SECRET") and use it in step 8

# 5. read over REST, at your source (introspected at the sandbox, recorded in
#    the ledger, then served)
curl -s "$SOURCE/v1/source/recovery?owner=$DID" -H "Authorization: Bearer $TOKEN"

# 6. read over MCP (the same handlers, the same record)
curl -s -X POST "$SOURCE/mcp" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"read_scope","arguments":{"scope":"recovery","owner":"'"$DID"'"}}}'

# 7. the read is in the person's ledger
curl -s "$SANDBOX/v1/consent/ledger/$DID" -H "Authorization: Bearer $SESSION"

# 8. revoke, and watch the next read fail
curl -s -X POST "$SANDBOX/v1/consent/revoke" -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" -d '{"consent_id":"'"$CONSENT_ID"'"}'
curl -s -i "$SOURCE/v1/source/recovery?owner=$DID" -H "Authorization: Bearer $TOKEN"
# HTTP/1.1 401  www-authenticate: Bearer error="invalid_token"
```

Two refusals worth provoking on purpose: a scope the token does not cover
(`GET $SOURCE/v1/source/cgm?owner=$DID` answers `403 insufficient_scope` and
records nothing) and another person's DID as `owner` (`403 wrong_subject`).

## The authorization code flow against your source

The walkthrough above is the sandbox's API path: its token carries no audience.
An agent that follows the standard takes the authorization code flow, and its
token is bound to the resource it asked for, so your source's address has to be
a resource of the client. Register it on the agent's client with `resources`
(live on the hosted sandbox since 2026-11-04, contract 0.27.0), with the
redirect URI the agent will use:

```bash
curl -s -X POST https://sandbox.lifecare.id/v1/sandbox/clients \
  -H "Authorization: Bearer $DEVACCESS" -H "Content-Type: application/json" \
  -d '{"name":"My agent","redirect_uris":["http://127.0.0.1:4000/callback"],"resources":["http://localhost:8799/sandbox-source/mcp"]}'
# {"client_id":"sbx_...","client_secret":"...","redirect_uris":[...],"resources":["http://localhost:8799/sandbox-source/mcp"], ...}
```

The source on your machine checks a token's audience against exactly the string
its own metadata names as `resource`, built from the host the caller used, so
register the one you will call. `http://localhost:8799/sandbox-source/mcp` is
not `http://127.0.0.1:8799/sandbox-source/mcp`, and the sandbox compares what you
registered byte for byte: a client that asks for the other spelling is refused
at `/authorize` with `invalid_target`. Read the string back from your source:

```bash
curl -s http://localhost:8799/.well-known/oauth-protected-resource/sandbox-source/mcp
```

Then point the library's client half at it, with `resource` set to that
string, as in [lib/person-managed-auth/README.md](../lib/person-managed-auth/README.md)
(its redirect receiver included). The person's yes happens at the hosted
sandbox; the token comes back with your source's address as its `aud`, and your
source accepts it. Only your own clients can ask for the resource (another developer's
clients get `invalid_target`), and a client registered before 2026-11-04 cannot
hold one: register a new client. The same token presented to the hosted source is refused with
`401 invalid_token`, because it was issued for another resource.

## Its own discovery document

The server also answers `/.well-known/oauth-protected-resource/sandbox-source/mcp`,
the OAuth protected resource metadata (RFC 9728) the hosted source publishes,
naming your address (`http://localhost:8799/sandbox-source/mcp`) as the
resource and the sandbox in `LIFECAREID_SANDBOX_ORIGIN` as the authorization
server. The `401` for an MCP request with no token points to it in
`WWW-Authenticate`, so a client that follows the MCP authorization
specification finds the sandbox from your source alone.

## Point an MCP client at it

```json
{
  "mcpServers": {
    "lifecare-sandbox-source": {
      "type": "http",
      "url": "http://localhost:8799/sandbox-source/mcp",
      "headers": { "Authorization": "Bearer lc_..." }
    }
  }
}
```

A single `tools/call` for a scope the token does not cover is refused at the
transport, not inside the tool result: HTTP `403` with `{detail, error}` as the
body and `WWW-Authenticate: Bearer error="insufficient_scope", scope="<the scope asked for>", resource_metadata="..."`,
so a client that follows the MCP authorization specification can step up to the
scope named; inside a JSON-RPC batch the same refusal stays a tool error, and
nothing is written to the ledger either way. This is in the copy of the source
here (version 0.3.0).

One thing the hosted source (0.3.1) does that this copy does not yet: it exposes
`www-authenticate`, `mcp-session-id` and `mcp-protocol-version` to pages on other
origins (`Access-Control-Expose-Headers`). Until the next sync, a browser page
that calls your local source sees `null` for `WWW-Authenticate`; a client
outside a browser reads it as described.

## How it is wired

The container runs `compose/source/server.mjs`, Node's http module in front of
the same handlers the hosted Pages Function mounts, with the kit mounted
read-only. Besides the source it routes the well-known path above to the
metadata handler, as the hosted site mounts it. It reads three variables: `LIFECAREID_SANDBOX_ORIGIN` (the hosted
sandbox by default) and the two client credentials from `.env`. The source
accepts an `https` origin, or plain `http` on loopback only; the hosted origin
is `https`, so the rule in `source/source.js`, kept identical to the hosted
code, holds without any network arrangement.

Two things follow from checking tokens at the hosted sandbox. The hosted
sandbox is gated: registering clients and minting identities take the
developer access token, so the walkthrough above needs one even though the
source is on your machine. And its rate limits apply: the sandbox limits token
checks per calling address, so a burst of reads from your machine can answer
`503 introspection_unavailable` for a while.

## Without Docker

```bash
LIFECAREID_SANDBOX_ORIGIN=https://sandbox.lifecare.id \
LIFECAREID_SANDBOX_SOURCE_CLIENT_ID=sbx_... LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET=... \
node compose/source/server.mjs
# sandbox source listening on http://0.0.0.0:8799/sandbox-source
```

The origin has no default outside Compose: unset, every data route answers
`503 source_not_configured`. Node 22 or newer, no dependencies.
