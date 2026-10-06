# Run the whole loop locally

Two containers: the LifeCare.ID® identity server in sandbox mode, from the
published image, and the synthetic data source beside it. No account, no
developer-access gate, no network beyond pulling the images.

```bash
cd compose
docker compose up
# sandbox:  http://localhost:8821
# source:   http://localhost:8799/sandbox-source
```

`docker compose down -v` resets the sandbox's state (clients, identities,
grants, the ledger). The state is synthetic and disposable.

## The image

`ghcr.io/enbarca/lifecareid:sandbox` is the production lifecare.id binary; the
`:sandbox` tag follows the latest published release and `:sandbox-<short sha>`
names one exact build. There is no sandbox-specific build. The container is a
sandbox because `LIFECAREID_SANDBOX=true` is in its environment, which opens
the three self-service routes (`POST /v1/sandbox/clients`,
`DELETE /v1/sandbox/clients/{client_id}`, `POST /v1/sandbox/test-identity`)
that a production instance answers `404` to. Every other variable in
`docker-compose.yml` has a comment saying what it is for.

## The walkthrough, against localhost

The same steps as the hosted walkthrough at
[developers.lifecare.id/sandbox-data-source.html](https://developers.lifecare.id/sandbox-data-source.html),
with no developer access token. The example client runs them in one go:

```bash
SANDBOX=http://localhost:8821 SOURCE=http://localhost:8799/sandbox-source node ../examples/run-loop.mjs
```

By hand:

```bash
SANDBOX=http://localhost:8821
SOURCE=http://localhost:8799/sandbox-source

# 1. register a client
curl -s -X POST "$SANDBOX/v1/sandbox/clients" -H "Content-Type: application/json" \
  -d '{"name":"Pilot agent","redirect_uris":["http://localhost:4000/callback"]}'
CLIENT_ID=sbx_...        # client_id from the response

# 2. mint a synthetic identity
curl -s -X POST "$SANDBOX/v1/sandbox/test-identity" -H "Content-Type: application/json" -d '{}'
DID=did:web:sandbox.local:u:...   # did from the response
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

# 5. read over REST (introspected, recorded in the ledger, then served)
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

## How the two containers are wired

The source accepts a plain-http sandbox origin only on loopback (a rule in
`source/source.js`, kept identical to the hosted code so the kit tests the code
that runs in production). The `source` service therefore shares the `sandbox`
container's network namespace (`network_mode: "service:sandbox"`), reaches the
sandbox as `http://localhost:8810`, and has its own port published on the
`sandbox` service. The source presents a client credential on every
introspection, because the sandbox admits only an authenticated client there
(RFC 7662, section 2.1): `LIFECAREID_SERVICE_CLIENTS` on the sandbox and the
two `LIFECAREID_SANDBOX_SOURCE_CLIENT_*` variables on the source carry the same
value. Its default is for this loopback sandbox only; a `.env` file beside
`docker-compose.yml` with `SOURCE_CLIENT_SECRET=...` overrides it.

## Without Docker

Run the source alone against any sandbox, hosted or local:

```bash
LIFECAREID_SANDBOX_ORIGIN=https://sandbox.lifecare.id \
LIFECAREID_SANDBOX_SOURCE_CLIENT_ID=... LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET=... \
node compose/source/server.mjs
```

The credentials must belong to a client the sandbox knows: on the hosted
sandbox, a client you registered with `POST /v1/sandbox/clients`.
