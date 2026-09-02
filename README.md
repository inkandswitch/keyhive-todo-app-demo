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
- Sharing a document by invite link, which anyone can open to add themselves.
- Making a document public so anyone can read or edit it.
- Revoking access, and access-gated UI (read-only view, hidden share button)
  driven by keyhive membership.
- Naming documents with [onomancy](https://github.com/inkandswitch/onomancy),
  so a list can be opened as `~/todos/groceries` or `@example.com/todos`
  instead of by document id.

## Run

The demo needs a phonebook document id, which it requires you to supply. Generate
one into a `.env` file, then start the app:

```
pnpm install
echo "PHONEBOOK_DOC_ID=$(pnpm -s gen:phonebook-id)" > .env
pnpm dev
```

The app opens at http://localhost:5557.

Do this once. Keep the same id from then on. A fresh one points the app at a
brand new, empty phonebook, so every name and avatar disappears. `.env` is
gitignored.

To override the id for a single run without touching `.env`:

```
PHONEBOOK_DOC_ID=automerge:... pnpm dev
```

### With Nix

`nix develop` drops you into a shell with node, pnpm and the language servers,
and prints a menu of the commands below.

| Command             | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `dev`               | Seed `.env` if it has no id yet, then start the dev server.                |
| `dev:local`         | The same, against a local sync server instead of the public one.           |
| `env:init`          | Write a fresh `PHONEBOOK_DOC_ID` to `.env`, leaving an existing one alone. |
| `lint` / `lint:fix` | ESLint and Prettier.                                                       |
| `sync-server`       | Run a local `subduction_cli` on `:3030`. Built on first use.               |
| `ci`                | Lint, typecheck and build, the way CI runs them.                           |

Each is also a flake app, so `nix run .#ci` and `nix run .#sync-server` work
without entering the shell. `sync-server` builds the subduction Rust workspace
the first time you run it, which is why it is not part of the dev shell.

## Phonebook configuration

The phonebook is a shared document holding every peer's display name and avatar.
It is an ordinary Automerge document: unencrypted, and writable by anyone who
knows its id. So rather than shipping one hardcoded id that every copy of the
demo writes to, the demo requires you to supply your own via the
`PHONEBOOK_DOC_ID` build variable. Generate an id with `pnpm gen:phonebook-id`
and share it with the people you want in your phonebook.

The document does not need to exist beforehand. The first peer to run with a
given id creates it and later peers pick it up from the sync server.

Keep in mind that the id is the only thing protecting the phonebook. Anyone you
give it to, and anyone they give it to, can edit its entries. This is fine for a
demo but is not an access-control mechanism. The TODO documents themselves are
end-to-end encrypted and access-controlled by keyhive.

## Sync server configuration

By default the demo connects to the public keyhive sync server at
`wss://keyhive.sync.automerge.org` using ARK's built-in `keyhive` identity.

Three build-time variables override this:

| Variable                   | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `SYNC_SERVER`              | Websocket endpoint (e.g. `ws://localhost:3030`). |
| `SYNC_SERVER_CONTACT_CARD` | The server's signed contact card JSON.           |
| `SYNC_SERVER_PEER_ID`      | The server's keyhive peer id.                    |

`SYNC_SERVER_CONTACT_CARD` and `SYNC_SERVER_PEER_ID` must be set together, and
the identity they describe must match the server `SYNC_SERVER` points at. When
they are unset the demo uses the built-in `keyhive` identity.

## Invite links

"Create invite link" in the share modal produces a URL that anyone can open to
give themselves access to that list, at the access level selected next to it.

In Keyhive, every membership change has to be signed by a principal that already
holds at least the access being granted. An invite link carries one. Creating it
generates a throwaway keyhive identity, delegates the document to that identity,
and puts its key pair and prekey secrets in the URL fragment. Opening the link
rebuilds that identity in the visitor's browser, briefly runs it as a second hive
against the same sync server, and uses it to delegate the document to the visitor's
own identity.

The link is a bearer capability. Anyone who sees the URL has the access it
carries, so treat it the way you would treat the document's contents.

Once the join finishes, the fragment is replaced so the key material doesn't stay
in the tab's history.

The throwaway identity appears in the member list like any other member.
Removing it there turns the link off. Keyhive re-roots the people who joined
through it under whoever revokes it, so turning off a link does not remove the
people who already used it.

## Names

A list can be given a name instead of being passed around as a document id.
Right-click a list in the sidebar and choose "Name this list...", then open it
again from "Open by name". A name is also a URL, so `#~/todos/groceries` in the
address bar resolves and opens the same list.

Names come from [onomancy](https://github.com/inkandswitch/onomancy). A name
has an anchor and a path, and the anchor is the whole of what makes the answer
trustworthy:

| Name                  | Starts from                         | Worth                                       |
| --------------------- | ----------------------------------- | ------------------------------------------- |
| `~/todos/groceries`   | your own namestore                  | as much as the document you hold            |
| `@example.com/todos`  | the document that domain designates | a DNSSEC chain from the IANA root           |
| `automerge:.../todos` | that document                       | the id is the key, so it is self-certifying |

After the anchor picks a starting document, all three walk identically: each
path segment follows one edge to the next document, taking the longest matching
key at each step and never backtracking. A bare `todos/groceries` is read as a
`~` name, and the canonical spelling is what the app reports back.

### Namestores

A namestore is where names are written. It is an ordinary keyhive document, so
who may bind a name in it is an access-control question with a real answer, and
it is created through ARK, so its id is an ed25519 verifying key. Onomancy
requires that: a legacy Automerge document id is rejected as "not
self-certifying", which is why names do not live in the phonebook.

Yours is created on first run. Its id, and the DNS record described below, are
in the account modal behind the avatar in the top right.

Binding `@example.com/todos` writes into the namestore _that domain_
designates, not yours, so it needs admin access there. The anchor decides which
document is written; the write itself is the same in every case.

### Partial resolution

A name can stop part way, and the demo says so rather than calling it an error:

- The next document has not synced to this device. Nothing is proven about the
  name; a replica may arrive and the same walk finish.
- The document is held and simply has no edge for what remains. That is an
  answer: nothing is bound there.

Resolution reads locally held replicas and never blocks on sync, so stopping
short is the designed behaviour under partition rather than a failure.

### Claiming a domain

Publish the DNS record from the account modal as a TXT record at
`_onomancy.<your-domain>`. Once DNSSEC signs it, `@your-domain/...` resolves
for everyone, verified locally from the IANA root key baked into the onomancy
Wasm — no certificate authority and no trusted resolver.

The record names the _namestore document_, not you. Ownership of the name is
whoever that document grants admin to, so a name is shared by inviting another
admin rather than by editing DNS again, and a key rotation does not touch DNS
either.

DNS proves `hostname -> document`. Keyhive proves `document -> people`. Neither
layer is asked to do the other's job.

## Verified names

An identity can claim a DNS name in the account modal, and it shows up beside
them in the share modal and the contact search. A claim is only a claim until
it is checked, so it carries a status:

| Badge          | Means                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `verified`     | A DNSSEC-valid `_onomancy` record designates a document this identity administers. See below — it is narrower than it sounds. |
| `mismatch`     | The domain's record designates somebody else. The claim is false.                                                             |
| `contested`    | Two records of equal precedence name different documents. Misconfigured, not unclaimed.                                       |
| `chain-failed` | Records arrived and failed validation. A security signal, not a network one.                                                  |
| `replayed`     | A stale chain carried a serial no higher than one already accepted. A replay.                                                 |
| `deferred`     | Every record is dated past the skew bound. Usually your clock, not an attack.                                                 |
| `no-claim`     | DNS answered; the domain simply publishes no binding.                                                                         |
| `offline`      | The domain could not be reached. Retrying may work.                                                                           |
| `malformed`    | Not a usable hostname. The fix is in the input box.                                                                           |
| `unsynced`     | The domain designates a document this device has not synced, so the claim cannot be checked yet.                              |
| `pending`      | The check is still running.                                                                                                   |
| `invalid`      | Not a DNS name at all.                                                                                                        |

**They are split by remedy**: retry, fix the input, tell the domain owner, or
treat as a possible attack. One status covering all of them tells every user
their network is at fault — over a typo, over a domain that makes no claim,
and over a zone whose records failed validation — which makes an attack look
like an outage.

### Replays, and why the bound comes first

`replayed` is the serial ratchet: a resolver remembers the highest serial it
has accepted for a name, and a record arriving on a stale chain with a serial
no higher than that is a replay of something already superseded. Selection
within one DNS answer cannot catch this — the attack is one record at a time,
across two queries, never two records in one response.

`deferred` is what makes the ratchet safe to have at all, and the order is
load-bearing. A serial dated far in the future is set aside before selection,
so it never becomes the winner and never reaches the ratchet. **Without that
bound, one forged far-future serial jams the ratchet at a value nothing honest
will ever exceed, and every legitimate record afterwards reads as a replay** —
the defence becomes the attack, while appearing to work. A poisoned name is
bounded to roughly five minutes ahead of the clock, and any record on a fresh
chain can move the ratchet back down to heal it.

So the ratchet is deliberately **not** a monotone maximum. Freshness outranks
it, which is also what lets a domain change hands legitimately.

### What a verified badge proves, exactly

That the domain, as attested by a DNSSEC chain from the IANA root key during
the window that chain's signatures were valid, designated a document that this
identity holds admin access on.

That is all, and it is **one-directional**. In particular it does **not**
prove:

- **That the document accepts the domain.** No onomancy certificate is
  consulted. A domain may unilaterally name any document id, and that
  document's admins cannot decline — under the protocol the document _speaks_,
  and refusing to sign a certificate is how it declines. Here the only thing
  preventing a badge is the identity not claiming the name. So consent is
  present, in a weak sense, and not in the sense the protocol means.
- **That anyone else could check it.** A certificate is self-authenticating:
  it verifies from bytes that arrived by any route, so it can be gossiped. This
  verdict is _local_ — it needs the designated document replicated here and
  keyhive state present. A third party cannot be shown why the badge was
  earned. That is a different kind of claim, not a smaller amount of the same
  one.
- That the person behind the identity is who you think. It proves control of a
  domain, not identity.
- Anything about the domain owner's intentions, or that they meant to vouch for
  anything this identity does.
- Anything about any other name, including similar-looking ones. Verification is
  per-name.
- That the binding is current. DNSSEC signatures have validity windows, and a
  chain is graded for freshness rather than treated as timeless.

The stronger, certificate-backed claim is the one the **banner above a
name-resolved list** reports, and it is a separate check — see "Names" above.
A document can carry a verified certificate while none of its admins claim the
domain, and an identity can carry this badge while the document has certified
nothing. They are different questions about the same pair.

### The verdicts that are not evidence

`offline`, `no-claim` and `unsynced` are not weak versions of `mismatch`. They
are the absence of an answer, and the demo keeps them visually distinct from it
for that reason. A domain that is down, one that never made a claim, or a
namestore that has not arrived tells you nothing about whether the claim is
true — treating any of them as suspicion would punish people for network
conditions.

`mismatch` is different. It means a record was fetched, validated, and
designates someone else. That is a real answer, and a negative one.

`chain-failed` is different again, and is the one to take seriously. Records
arrived and failed validation, which is what tampering looks like. It sits on
the security axis, not the connectivity one, and grouping it with `offline`
would render a possible attack as "try again later".

### A claim is forgeable; a badge is not

Claims live in the phonebook, which is unencrypted and writable by anyone
holding its id, so anyone can write any claim into anyone's entry. This is
safe, and it is the architecture working rather than a gap in it: the badge is
not read from the phonebook. It comes from resolving the domain and checking
what that domain designates. A forged claim renders `mismatch` or `no-claim`.
Nobody can write their way to `verified`.

The document carries the assertion. DNS carries the authority.

### The errors run one way

The guarantee above is one-directional, and it is worth being explicit about
which direction. Verification does not produce false positives: a badge cannot
be forged, because it is not read from any document an attacker can write.

It does produce **false negatives** — legitimate holders of a name reading as
unverified. Never wrongly verifying, while sometimes wrongly failing to verify,
is the right trade for a naming system. Saying so is more useful than implying
the checks are exact.

The known case: designation consults the bound document's own delegations, and
those do not change when a group that already has access gains a member. So an
identity holding admin on a namestore _through a group_ rather than directly
reads `unsynced` — the copy for "cannot check yet" — about a document that is
plainly present. This demo supports nested groups, so the case is reachable
here.

The verdict is honest; the wording is not. Fixing the wording is possible
today. Fixing the _verdict_ is not: the only available evidence about indirect
access is the set of individuals holding decryption keys for the document,
which carries no access level at all. That could support an honest "holds keys
to this document, by some route, at an unknown level" — never a checkmark.
Verifying a nested-group admin needs transitive delegations _with_
capabilities, which no current API exposes.

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
