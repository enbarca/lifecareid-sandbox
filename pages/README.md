# The reference deployment: a Cloudflare Pages function

The hosted source at `https://lifecare.id/sandbox-source` is this function,
mounted on the marketing site's Pages project. It runs on the edge, away from
the sandbox's own host, so it keeps answering while that host moves. The
functions have no behaviour of their own: they import `handleRequest` and
`handleProtectedResourceMetadata` from `source/source.js` and call them with the
request and the Pages `env`.

```
functions/sandbox-source/[[path]].js                          everything under /sandbox-source/
functions/.well-known/oauth-protected-resource/[[path]].js    the OAuth protected resource metadata (RFC 9728)
```

The second function serves `/.well-known/oauth-protected-resource/sandbox-source/mcp`,
the document that names the sandbox as the authorization server and that the
`401` challenge of the MCP endpoint points to. It reads the same
`LIFECAREID_SANDBOX_ORIGIN` variable and names its own origin from the request.

In the hosted site the module sits in a `libs/` folder beside `functions/`, so
the import paths there differ from the ones in this kit; the files are otherwise
identical. To deploy your own copy, put `source/` where your Pages project can
import it and run `npx wrangler pages deploy <site dir>` from the folder that
holds `functions/`.

## The two project variables

| Variable | What it is | Where it is set |
|---|---|---|
| `LIFECAREID_SANDBOX_ORIGIN` | the sandbox the source introspects tokens at: `https://sandbox.lifecare.id`. No trailing path. (The code also accepts plain `http` on loopback, a rule kept identical to the hosted code for its own tests; it is not a second sandbox to run.) Unset, every data route answers `503 source_not_configured` and nothing is served | a plain-text Pages variable (it is public anyway): Settings, Variables and Secrets, Add, without Encrypt |
| `LIFECAREID_SANDBOX_SOURCE_CLIENT_ID` and `LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET` | the source's own client at the sandbox. Introspection admits only an authenticated client (RFC 7662, section 2.1), so without them the sandbox answers the source `401` and the source reports `503 source_not_authorized` | Pages **secrets**, both |

```bash
npx wrangler pages secret put LIFECAREID_SANDBOX_SOURCE_CLIENT_ID --project-name <project>
npx wrangler pages secret put LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET --project-name <project>
```

The origin is a variable and the two client values are secrets, so the commands
above set the secrets only; the code reads all three the same way, from `env`.
A Pages variable binds at deploy time: set it before the deploy, or redeploy
after setting it.

## The secret-handling rule

The client secret is the only secret the source holds, and it never leaves the
function except as the `Authorization: Basic` header on the two calls to the
sandbox. The descriptor at `GET /sandbox-source/` reports whether credentials
are present (`client_credentials: true`), never the credentials. Do not log the
`env`, do not echo it in an error, do not put the secret in a variable that is
not marked secret, and do not commit it anywhere: a `wrangler.toml` `[vars]`
block is committed configuration, so the secret does not belong there. The
client is a service client of the sandbox; when it rotates, set the new secret
and redeploy, and the old one stops working at the sandbox's end.
