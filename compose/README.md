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
  -d '{"name":"Pilot agent","redirect_uris":["http://localhost:4000/callback"]}'
CLIENT_ID=sbx_...        # client_id from the response

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

# 4. a token for one scope
curl -s -X POST "$SANDBOX/v1/token" -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" -d '{
  "subject_did":"'"$DID"'","scope":"recovery","purpose":"agent governance pilot","requester":"'"$CLIENT_ID"'"}'
TOKEN=lc_...

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
nothing is written to the ledger either way.

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
