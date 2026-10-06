# The reference deployment: a Cloudflare Pages Function

The hosted source at `https://lifecare.id/sandbox-source` is this function,
mounted on the marketing site's Pages project. It runs on the edge, away from
the sandbox's own host, so it keeps answering while that host moves. The
function has no behaviour of its own: it imports `handleRequest` from
`source/source.js` and calls it with the request and the Pages `env`.

```
functions/sandbox-source/[[path]].js   everything under /sandbox-source/
```

In the hosted site the module sits in a `libs/` folder beside `functions/`, so
the import path there differs from the one in this kit; the file is otherwise
identical. To deploy your own copy, put `source/` where your Pages project can
import it and run `npx wrangler pages deploy <site dir>` from the folder that
holds `functions/`.

## The two project variables

| Variable | What it is | Where it is set |
|---|---|---|
| `LIFECAREID_SANDBOX_ORIGIN` | the sandbox the source introspects tokens at: `https://sandbox.lifecare.id`, or `http://localhost:<port>` for a sandbox run locally. No trailing path. Unset, every data route answers `503 source_not_configured` and nothing is served | a Pages variable (plain text is fine; it is public anyway) |
| `LIFECAREID_SANDBOX_SOURCE_CLIENT_ID` and `LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET` | the source's own client at the sandbox. Introspection admits only an authenticated client (RFC 7662, section 2.1), so without them the sandbox answers the source `401` and the source reports `503 source_not_authorized` | Pages **secrets**, both |

```bash
echo "https://sandbox.lifecare.id" | npx wrangler pages secret put LIFECAREID_SANDBOX_ORIGIN --project-name <project>
npx wrangler pages secret put LIFECAREID_SANDBOX_SOURCE_CLIENT_ID --project-name <project>
npx wrangler pages secret put LIFECAREID_SANDBOX_SOURCE_CLIENT_SECRET --project-name <project>
```

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
