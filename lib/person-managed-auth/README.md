# Person-managed authorization

*Draft 1. Follows the hosted sandbox as it behaves on 2026-11-04. The open agent
authorization profile is planned for 2026-12-01 and may change any shape marked
`profile draft 1 may change this` in the code.*

A library that lets an agent ask a person once, through a standard, keep the
receipt, and stop when the person says stop, and lets a server that holds
something of a person's name the authorization server, check the grant at every
request and write the receipt. LifeCare.ID® is its first implementation.

Person-managed authorization is the move: the person, not the agent or the
server, decides what an agent may read, and can end it at any time. The agent
asks through OAuth as the MCP authorization specification describes it. The
person's yes happens on the authorization server's own origin, and the library
never renders it.

## The two halves

| Half | For | Does |
|---|---|---|
| Client, `@lifecareid/person-managed-auth/client` | an agent | discovers the server's protected resource metadata (RFC 9728, path form then root form) and the authorization server's metadata (RFC 8414, then OpenID), runs the authorization code flow with PKCE and hands you the URL for the person's yes, carries one single-scope token, steps up to another scope when the server says so, keeps the receipt of every read, and stops at the person's stop |
| Server, `@lifecareid/person-managed-auth/server`, with `/node` and `/pages` | an MCP server or a resource API | publishes RFC 9728 metadata naming the authorization server, answers 401 with the `resource_metadata` challenge and the one scope it suggests, accepts a token only when the authorization server says it is active, an access token, issued to a client you accept and, when it has an audience, issued for this resource, asking at every request so a stop holds at the next one, refuses a wrong scope on a single call with the 403 step-up header, and writes the receipt of every read before answering |

## The one-afternoon path

You need a client registered at the authorization server. For the hosted sandbox
that is `POST /v1/sandbox/clients` with your developer access token
([developers.lifecare.id/sandbox](https://developers.lifecare.id/sandbox)); the
examples do it for you.

### An agent

```js
import { createAgent, PersonStopped } from "@lifecareid/person-managed-auth/client";

const agent = createAgent({
  resource: "https://lifecare.id/sandbox-source/mcp",  // the MCP endpoint you read from
  issuer: "https://sandbox.lifecare.id",               // the one origin your client secret goes to
  clientId, clientSecret,                              // the client you registered there
  redirectUrl: "http://127.0.0.1:4000/callback",       // one of its registered redirect URIs
  clientName: "My agent",
  onStopped: (stop) => console.log(stop.message),
});

try {
  const { result, receipt } = await agent.callTool("read_scope", { scope: "daily", owner }, {
    // Called when the person has to be asked. Show them ask.authorizeUrl; the yes
    // happens there, on the authorization server's origin. Return the URL they
    // are redirected to, or { code, state, iss }.
    ask: async (ask) => await getTheCallbackFromThePerson(ask.authorizeUrl),
  });
  console.log(receipt);                  // { consent_id, ledger_entry_hash, access_recorded, scope, tool, at }
} catch (e) {
  if (e instanceof PersonStopped) { /* the person revoked; agent.stopped is aborted */ }
}
agent.showMyGrant();                     // what it holds, never the token
agent.showMyReceipts();                  // consent ids and hashes, never a value
```

`callTool` returns `{ ok: true, result, receipt }`, or `{ ok: false, ask }` when
the person has to be asked and you passed no `ask`; then call `finishAuth` with
the callback and call again. Details are in the table below.

### A server

```js
import http from "node:http";
import { createResourceServer } from "@lifecareid/person-managed-auth/server";
import { nodeHandler } from "@lifecareid/person-managed-auth/node";

const pma = createResourceServer({
  resource: "https://api.example.com/read",            // this resource's identifier
  authorizationServer: "https://sandbox.lifecare.id",  // whose tokens you accept
  clientId, clientSecret,                              // your own client there (goes only to that origin)
  scopes: ["daily"],
  grantees: "any",                                     // see "Which clients may hold a token"
});

http.createServer(nodeHandler(pma, async (request, { grant, receipt }) => {
  return { band: "drifting" };                         // your data; the receipt is added to the answer
}, { scope: "daily" })).listen(8801);
```

The grant's `owner` is the person whose data the token opens: serve that
person's data and nobody else's.

For a Cloudflare Pages Function use `pagesFunction` from `/pages` and mount it
a second time at `functions/.well-known/oauth-protected-resource/[[path]].js`.
For an MCP endpoint that authorizes each message itself, pass `{ raw: true }`
and call `authenticate`, `requireScope` and `record` yourself; the kit's
[`synthetic-mcp.mjs`](../../examples/person-managed-auth/synthetic-mcp.mjs) is
under ninety lines, most of them comments.

## The examples

Two, in [`examples/person-managed-auth/`](../../examples/person-managed-auth/),
each runnable against the hosted sandbox with a developer access token. They
register a sandbox client and a synthetic person at run time and delete the
client at the end. Both close the loop: discover, the person grants, read, the
receipt, the person revokes, the next read is refused. The server example
registers its own loopback address as a resource and takes its grant through the
authorization code flow too, which needs the hosted sandbox at 0.27.0 or later.

```bash
npm ci --prefix lib/person-managed-auth                                       # once: installs the SDK
LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/agent.mjs    # the client half
LIFECAREID_DEVACCESS_TOKEN=... node examples/person-managed-auth/server.mjs   # the server half
```

Until the package is published, the snippets' imports
(`@lifecareid/person-managed-auth/client`, `/server`, `/node`, `/pages`) go by
relative path: `lib/person-managed-auth/src/client.js`, `server.js`, `node.js`
and `pages.js`, as the examples do.

In both, the person's yes and revoke are made with a synthetic identity's
session, as the sandbox walkthrough does, and the example says so where it
happens. A real agent never renders the yes.

## What the client does, call by call

| Call | Returns | Notes |
|---|---|---|
| `connect({ scope, askAgain, ask })` | `{ ok: true }` or `{ ok: false, ask }` | `ask` is `{ authorizeUrl, scope, reason }`, with `reason` one of `first`, `step_up`, `expired`. `askAgain: true` is the only way back after a stop |
| `finishAuth(callback)` | the grant, as `showMyGrant` | takes the callback URL, or `{ code, state, iss }`. Checks `state` and `iss`, then exchanges the code. Throws `PersonDeclined` on a no |
| `callTool(name, args, { ask })` | `{ ok: true, result, receipt }` or `{ ok: false, ask }` | throws `PersonStopped` after the stop, with no request made |
| `listTools()` | `{ ok: true, tools }` | |
| `showMyGrant({ live })` | `{ state, resource, issuer, scope, expires_at, consent_id }` | `state` is `none`, `held`, `ended` or `stopped`. With `live: true` it asks the authorization server about the token, as this agent's own client, and treats an inactive token that had not run out as a stop |
| `showMyReceipts()` | receipts, oldest first | `{ consent_id, ledger_entry_hash, access_recorded, scope, tool, at }` |
| `stopped` | an `AbortSignal` | aborted when the person stops the agent; `signal.reason` is the `PersonStopped`. Read the property each time: `askAgain` replaces the signal |

Two behaviours of the MCP SDK (1.32.2) that the library works with and you
should know. The SDK reads the 401 challenge only on a transport request, so the
library connects first and lets the 401 lead; it never calls the SDK's `auth()`
directly. And on a 403 step-up the SDK re-runs authorization for the named
scope and does not resend the call, so a call that needs another scope returns
`{ ok: false, ask }` with `reason: "step_up"`; after `finishAuth` you call it
again. The SDK replaces the held token with the new one; this draft does not keep
two tokens at once.

### The stop

A token that was accepted and is then refused with 401, within its lifetime, is
the person's stop. The library drops the token, aborts `agent.stopped`, calls
`onStopped` once, and throws `PersonStopped`. It does not retry and does not ask
the person again by itself. A token past its lifetime is not presented at all and
is reported as `ended`, with `reason: "expired"` on the next ask, because the
tokens here carry no refresh token. A token refused on its very first use is told apart by asking the issuer about
the agent's own token: inactive before its expiry means the person revoked
between the yes and the first read, and is a stop like any other; active means
the token does not fit the resource (audience, grantee), reported as
`TokenRefused`, not as a stop. A `403` that says `wrong_grantee` or
`wrong_token_type` on a first use is `TokenRefused` too.

### The credential rule

A credential you hold goes only to the origin you configured for it. The client
secret goes only to `issuer`; the access token only to `resource`. If the
resource's metadata names a different authorization server, the run stops with a
line that names it, before anything is sent:

> `https://api.example.com/mcp` names the authorization server `https://other.example`. This agent was configured for `https://sandbox.lifecare.id` and sends its credentials only there. If you trust `https://other.example`, set issuer to it yourself and use a client registered there. Nothing was sent.

The opt-in is to configure the other issuer yourself, with a client registered
there. The same rule holds on the server: the client secret goes only to the
authorization server's origin, and an endpoint override on another origin is
refused at construction. Every request the SDK makes passes through one check
before it leaves the process (redirects are the SDK's own within-origin policy,
which does not follow one to another origin). Discovery fetches the discovered
issuer's metadata, with no credential, before it can see that the issuer differs.

## What the server does, call by call

| Call | Does |
|---|---|
| `createResourceServer(options)` | the server. `resource`, `authorizationServer`, `clientId`, `clientSecret`, `scopes`, `grantees` are required (see below); `scope` (the one a 401 suggests), `accessor`, `documentation` are optional |
| `authenticate(request, { scope })` | asks the authorization server about the token, every time, caches nothing; throws a `Refusal`; returns the grant (`owner`, `scope`, `purpose`, `grantee`, `consentId`, `expiresAt`) |
| `requireScope(grant, scope)` | refuses with the 403 step-up refusal; for a server that learns the scope from the body of the call |
| `record(grant)` | writes one line to the person's ledger and returns the receipt `{ consent_id, access_recorded, ledger_entry_hash }`; fails closed with 503, nothing is served |
| `protect(handler, { scope })` | authenticate, record, then your handler; a plain object you return is sent with the receipt fields added |
| `route(handler)`, `fetchHandler(handler, { scope, raw })` | adds the metadata route; `raw` hands your handler the request untouched |
| `protectedResourceMetadata()`, `metadataUrl`, `metadataPath` | the RFC 9728 document and where it lives |

### Which clients may hold a token

`grantees` is required and has no default; the constructor refuses to start
without it. `"any"` accepts a token issued to any client the authorization
server names, which is what a server for many agents wants. An array of client
ids or a function narrows it. `"own"` accepts only a token issued to this
server's own registered client. A token that names no client is never accepted.
Each default would be wrong for half of servers, and the choice is one line.
Note that a token from the sandbox's API path carries no audience, so with `"any"`
a server serves any client's token of the right scope.

### What the server checks, and in what order

Active; not past its expiry; `token_type` is `access`; the audience, when
there is one, is this resource; the owner is a DID; the grantee is accepted.
Then the scope, if you asked for one. Then, for a read, the ledger line, and only
then your handler. Refusals are `{ detail, error }` with the status and, where it
applies, the `WWW-Authenticate` header: 401 `missing_token` and `invalid_token`,
403 `wrong_token_type`, `wrong_grantee`, `wrong_subject` and `insufficient_scope`,
503 `introspection_unavailable`, `server_not_authorized` and
`access_record_failed`.

## What it is not

- Not a gateway or a proxy: the library adds the receipt to your answer in your process and keeps and sends nothing else. The data goes from your server to the caller.
- Not a vault: the client keeps a token in memory for its lifetime and nothing else.
- Not a values store: a receipt is a consent id and a hash, and the library holds no health value on either side.
- Not a login: it does not tell you who the person is. It tells you what the person has allowed, for whom, until when.
- Not a ceremony: the library never renders the person's yes.

## Status of what this draft does not settle

| Question | Where it stands in this draft |
|---|---|
| Public clients, with no secret | not in this draft. The issuer refuses a secret-less client for a data scope today; the profile decides with Client ID Metadata Documents. This draft uses a registered confidential client and has no code path for dynamic registration |
| Several scopes in one token | refused by the issuer. The client asks for one scope and steps up for the next; the union is the profile's question |
| The receipt's shape | follows the hosted sandbox source today (`consent_id`, `access_recorded`, `ledger_entry_hash` in the body of the answer). The profile defines it in draft 1 |
| The introspection and ledger-write paths | the paths LifeCare.ID® uses under the issuer (`/v1/token/introspect`, `/v1/access/record`); overridable on the server |
| Resources a sandbox client can name | the hosted sandbox at 0.27.0 or later accepts a resource a developer registered (`resources` on `POST /v1/sandbox/clients`) as the `resource` of an `/authorize` request from any of that developer's own clients, so a server on your machine takes its token through the authorization code flow, and the token's `aud` is its loopback URL. Register the string the library holds (`pma.resource`) byte for byte: the library lower-cases the host and drops a default port and a trailing slash, and the sandbox compares the stored string exactly. Clients registered before 2026-11-04 carry no owner and cannot hold a resource. Another developer can register the same URL for their own clients, so decide which clients you accept with `grantees` |
| Which clients a server accepts | `grantees` is a required choice with no default. Once every authorization-code token carries an audience, the profile can say whether a data token may lack one at all |
| Revoked and expired | the standard 401 does not tell them apart. The client uses its own clock for a token it has seen expire, and asks the issuer about its own token when a token is refused on its first use |
| Python, other languages | a later row |

## Dependencies and licence

Apache-2.0, with the kit's NOTICE. One dependency, the official
`@modelcontextprotocol/sdk` 1.32.2 (MIT), used by the client half only; the
server half needs none. Its own dependencies are MIT, ISC, BSD-2-Clause and
BSD-3-Clause. Nothing in the library or the SDK's client path phones home. The
package is private and unpublished; the name is confirmed at publication.

LifeCare.ID® is a registered trademark of Enbarca Inc dba HCVC.net and is not
licensed by the Apache License.

## Tests

```bash
npm ci --prefix lib/person-managed-auth     # once: installs the SDK
node --test                                  # from the kit root
```

The tests run the real SDK against an authorization server double that behaves
as the hosted sandbox does, and the library's own server in front of a small MCP
endpoint, on loopback.

A coding agent working on this library should read [AGENTS.md](../../AGENTS.md) at the kit root first: the files it must not edit and the library's rules in ten lines.
