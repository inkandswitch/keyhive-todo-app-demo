# Keyhive TODO Demo

A small React app that shows how to build a collaborative, access-controlled app
with [automerge-repo](https://github.com/automerge/automerge-repo) and
[keyhive](https://github.com/inkandswitch/keyhive), wired together by
[automerge-repo-keyhive](https://github.com/inkandswitch/automerge-repo-keyhive)
(ARK).

Each TODO list is an end-to-end encrypted Automerge document. The demo
demonstrates:

- Creating and editing documents that sync through a subduction sync server.
- Sharing a document with another identity at a chosen access level (relay,
  read, edit, admin) via its contact card.
- Making a document public so anyone can read or edit it.
- Revoking access, and access-gated UI (read-only view, hidden share button)
  driven by keyhive membership.

## Run

The demo needs a phonebook document id, which it requires you to supply. Generate
one, then pass it in:

```
pnpm install
pnpm gen:phonebook-id
PHONEBOOK_DOC_ID=automerge:... pnpm dev
```

The app opens at http://localhost:5557.

## Phonebook configuration

The phonebook is a shared document holding every peer's display name and avatar.
It is an ordinary Automerge document: unencrypted, and writable by anyone who
knows its id. So rather than shipping one hardcoded id that every copy of the
demo writes to, the demo requires you to supply your own via the
`PHONEBOOK_DOC_ID` build variable. Generate an id with `pnpm gen:phonebook-id`
and share it with the people you want in your phonebook.

The document does not need to exist beforehand. The first peer to run with a
given id seeds it, and later peers pick it up from the sync server.

Keep in mind that the id is the only thing protecting the phonebook. Anyone you
give it to, and anyone they give it to, can edit its entries. This is fine for a
demo but is not an access-control mechanism. The TODO documents themselves are
end-to-end encrypted and access-controlled by keyhive; the phonebook is not.

## Sync server configuration

By default the demo connects to the public keyhive sync server at
`wss://keyhive.sync.automerge.org` using ARK's built-in `keyhive` identity.

Three build-time variables override this:

| Variable | Purpose |
| --- | --- |
| `SYNC_SERVER` | Websocket endpoint (e.g. `ws://localhost:3030`). |
| `SYNC_SERVER_CONTACT_CARD` | The server's signed contact card JSON. |
| `SYNC_SERVER_PEER_ID` | The server's keyhive peer id. |

`SYNC_SERVER_CONTACT_CARD` and `SYNC_SERVER_PEER_ID` must be set together, and
the identity they describe must match the server `SYNC_SERVER` points at. When
they are unset the demo uses the built-in `keyhive` identity.

## Build

```
pnpm build
```

The static site is written to `dist/`.

## Learn more

For the ARK API this demo is built on, see the automerge-repo-keyhive API guide
at `docs/automerge-repo-keyhive-api-guide.md` in the
[automerge-repo-keyhive](https://github.com/inkandswitch/automerge-repo-keyhive)
repository.
