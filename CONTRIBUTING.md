# Contributing

Thank you for looking. This kit is small on purpose; the most useful
contribution is a finding.

## Report a hole

Open an issue with the request you sent (method, path, headers with the token
removed, body) and the response you got. Say what the contract promised
instead; the two references are
[developers.lifecare.id/sandbox-data-source](https://developers.lifecare.id/sandbox-data-source)
for the source and
[developers.lifecare.id/sandbox](https://developers.lifecare.id/sandbox)
for the sandbox. A finding in the identity server, which is not in this
repository, is welcome here too and is taken upstream.

## Change the kit

- The source, the contract, the Pages function, the Compose file and the
  example are the things here. The identity server is not, in code or as an
  image; a change to what the sandbox does is an upstream change and an issue
  here is the way to ask for it.
- `source/source.js` is kept identical to the code that runs at
  `https://lifecare.id/sandbox-source`. A change there is proposed as an issue
  first. The same holds for the personas and data, the two Pages Functions, the
  two handler test files and `contract/openapi.json`: they are copied from
  upstream by `scripts/sync-upstream.mjs`, which records the commit in
  `sync/UPSTREAM`, so a hand edit to them would be overwritten by the next sync.
- Run `node --test` before opening a pull request. Node 22 or newer. The kit has
  no dependencies; the library in `lib/person-managed-auth/` has one, the
  official MCP SDK, and its client tests skip until you run
  `npm ci --prefix lib/person-managed-auth`. The library is not covered by the
  sync script and its folder is not in `sync/map.json`.
- Documents follow a few rules the tests enforce: no em dash, no exclamation
  point, no emoji, sentence case, and the mark written `LifeCare.ID®` wherever
  it appears as text.

## Licence

Contributions are accepted under the repository's licence, Apache-2.0, with no
separate agreement. The LifeCare.ID® trademark is not part of what is licensed.
