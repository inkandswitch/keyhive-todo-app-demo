// The namestore: the document this identity's names are written into.
//
// A namestore is an ordinary keyhive document holding a flat map of path to
// document reference under one reserved key. Two properties make it the right
// home for names, and neither of the demo's other documents has both:
//
//   - It is created through ARK, so its id is a self-certifying ed25519
//     verifying key. Onomancy rejects anything else as a doc anchor ("legacy
//     Automerge document ID — not self-certifying"), which rules out the
//     phonebook, whose id comes from gen:phonebook-id.
//   - It is access-controlled, so "who may bind a name here" is a keyhive
//     question with a real answer. The phonebook's answer is "anyone holding
//     its id", and the root document's is "nobody else, ever".
//
// It is also what a domain binds. The TXT record's p= field names this
// document, so whoever holds admin on it speaks for the domain. Ownership is
// shared by inviting more admins rather than by editing DNS.

import { AutomergeUrl, Repo, isValidAutomergeUrl } from "@automerge/react/slim";
import {
  AutomergeRepoKeyhive,
  uint8ArrayToHex,
} from "@automerge/automerge-repo-keyhive";
import { useEffect, useState } from "react";
import { errorMessage, log } from "./log";
import { nextSerial } from "./record";
import type { NamestoreEdges } from "./walk";

/**
 * The reserved top-level key namestore edges live under.
 *
 * Reserving one key lets a namestore share a document with other data without
 * colliding, which is what makes "the document a domain binds" and "the
 * document names live in" able to be the same document.
 */
export const RESERVED_ONOMANCY_KEY = "onomancy";

export type { NamestoreEdges } from "./walk";

export type NamestoreDoc = {
  [RESERVED_ONOMANCY_KEY]?: NamestoreEdges;
};

/**
 * The serial last published for a given record body.
 *
 * Keyed by body rather than by name because a serial orders *records*: the
 * binding has not changed unless `g=` or `p=` has. Re-minting for an unchanged
 * body would burn serials and, worse, make the displayed record shift under
 * the user while they are copying it into a DNS console.
 */
const SERIAL_KEY = "keyhive-demo-binding-serial";

interface StoredSerial {
  /** The `g=`/`p=` body this serial was minted for. */
  body: string;
  /** Decimal string, because JSON cannot carry a bigint. */
  serial: string;
}

function readSerials(): StoredSerial[] {
  try {
    const raw = localStorage.getItem(SERIAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredSerial[]) : [];
  } catch {
    return [];
  }
}

function toBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * The serial to publish for `body`, minting one only when the body is new.
 *
 * The highest serial this device has ever issued is the floor, so a fresh
 * binding supersedes every previous one even if the clock has since moved
 * backwards — which is the case plain `Date.now()` gets wrong, and gets wrong
 * silently, since the losing record looks perfectly well-formed.
 */
export function serialForBody(body: string): bigint {
  const stored = readSerials();

  const existing = stored.find((entry) => entry.body === body);
  if (existing) {
    const parsed = toBigInt(existing.serial);
    if (parsed !== null) return parsed;
  }

  const highest = stored.reduce<bigint | null>((max, entry) => {
    const value = toBigInt(entry.serial);
    if (value === null) return max;
    return max === null || value > max ? value : max;
  }, null);

  const minted = nextSerial(highest);
  try {
    localStorage.setItem(
      SERIAL_KEY,
      JSON.stringify([
        ...stored.filter((entry) => entry.body !== body),
        { body, serial: minted.toString() },
      ])
    );
  } catch {
    // A serial that cannot be persisted is still monotone for this session.
  }
  return minted;
}

function urlKey(identityHex: string): string {
  return `keyhive-demo-namestore-${identityHex}`;
}

function storedUrl(identityHex: string): AutomergeUrl | null {
  const raw = localStorage.getItem(urlKey(identityHex));
  return raw && isValidAutomergeUrl(raw) ? raw : null;
}

function remember(identityHex: string, url: AutomergeUrl): void {
  localStorage.setItem(urlKey(identityHex), url);
}

export interface Namestore {
  /** Null until the document has been created or read back from storage. */
  url: AutomergeUrl | null;
  /** Adopt a namestore another device or identity shared. */
  load: (url: AutomergeUrl) => void;
  error: string | null;
}

/**
 * This identity's namestore, created on first use.
 *
 * Created with `repo.create2` so it is a keyhive document like the task lists,
 * and granted sync server relay access so it reaches other devices. It is
 * seeded with the reserved map rather than left empty because a document with
 * no content never reaches the ready state in the current stack.
 */
export function useNamestore(
  repo: Repo,
  hive: AutomergeRepoKeyhive
): Namestore {
  const identityHex = uint8ArrayToHex(hive.active.individual.id.toBytes());
  const [url, setUrl] = useState<AutomergeUrl | null>(() =>
    storedUrl(identityHex)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A different identity has a different namestore.
    setUrl(storedUrl(identityHex));
  }, [identityHex]);

  useEffect(() => {
    if (url) return;
    let cancelled = false;

    void (async () => {
      try {
        const handle = await repo.create2<NamestoreDoc>({
          [RESERVED_ONOMANCY_KEY]: {},
        });
        // Relay access so the sync server can move its ciphertext, exactly as
        // a new task list gets in DocumentList.
        await hive.addSyncServerRelayToDoc(handle.url);
        if (cancelled) return;
        remember(identityHex, handle.url);
        setUrl(handle.url);
      } catch (err) {
        log.error("Could not create the namestore:", err);
        if (!cancelled) {
          setError(`Could not create the namestore: ${errorMessage(err)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, repo, hive, identityHex]);

  // NB there is deliberately no self-heal here. An earlier version discarded a
  // namestore that failed to load, on the theory that an own document which
  // never becomes ready is dead. It was removed rather than repaired:
  //
  //   - It could not help. The population it targeted — identities holding a
  //     url minted by a build that created these documents empty — exists only
  //     in intermediate commits of an unmerged branch, and those identities
  //     carry no marker distinguishing them, so the guard skipped exactly the
  //     cases it was written for.
  //   - It could harm. `repo.find` rejects promptly for a document this device
  //     may not read yet, so a transient failure (cold start after storage
  //     eviction, a grant not yet arrived) discarded the ONLY pointer to a live
  //     namestore, and a published DNS record then designated a document its
  //     owner could no longer write.
  //
  // A namestore that will not load is a diagnosis, not something to act on
  // silently: destroying a key to fix a lock needs better evidence than an
  // absence, and an absence is all this device can observe.
  return {
    url,
    error,
    load: (loaded: AutomergeUrl) => {
      remember(identityHex, loaded);
      setUrl(loaded);
      setError(null);
    },
  };
}

/**
 * How long to wait for one hop before calling it unavailable.
 *
 * `repo.find` does not fail fast for a document this device is *permitted* to
 * read but has not received: it waits, indefinitely, for a replica that may
 * never arrive. Observed against a real DNS-designated namestore that had been
 * granted public read — before the grant `find` rejected promptly with
 * "Document is unavailable", after it the same call was still pending at 60
 * seconds. Without a bound, one such hop hangs the whole walk and the UI sits
 * on "Resolving..." forever.
 *
 * A walk that gives up is reporting `unsynced`, which is exactly true: no
 * replica arrived in the time allowed. It is not a claim that none exists.
 */
const HOP_TIMEOUT_MS = 10_000;

/**
 * The namestore edges of one document, or `undefined` when this device does
 * not hold it.
 *
 * The distinction matters: no edges is an answer ("nothing is bound here"),
 * while an unheld document is the absence of one, and the walk reports them
 * differently.
 */
export async function edgesOf(
  repo: Repo,
  url: AutomergeUrl
): Promise<NamestoreEdges | undefined> {
  let doc: unknown;
  const abort = new AbortController();
  const giveUp = setTimeout(
    () => abort.abort(new Error("hop timed out")),
    HOP_TIMEOUT_MS
  );
  try {
    // The signal cancels the wait, not the load: a replica that arrives later
    // is still kept, so retrying the same name can succeed.
    const handle = await repo.find<NamestoreDoc>(url, { signal: abort.signal });
    doc = handle.doc();
  } catch (error) {
    // Four different things arrive here — a timeout, a permission denial, a
    // malformed url, an internal repo error — and the walk has one word for
    // all of them. `unsynced` is the safe direction, since it never claims a
    // name is unbound, but it is only TRUE for the timeout.
    //
    // The permission case is the one it misleads: a stranger walking into a
    // document they may not read is told to wait, and waiting cannot help.
    // The honest remedy is "ask for access", which the message does not offer.
    //
    // Logging the reason is the containable half of the fix. Carrying it to
    // the user needs a third `PartialReason`, which changes `EdgeLookup`'s
    // contract and the walk's tested surface — tracked rather than smuggled
    // in here. Until then the console has what the screen does not.
    log.debug(
      `onomancy: no edges for ${url} (${
        abort.signal.aborted ? "timed out" : "rejected"
      }):`,
      error
    );
    return undefined;
  } finally {
    clearTimeout(giveUp);
  }
  if (typeof doc !== "object" || doc === null) return undefined;

  const map = (doc as Record<string, unknown>)[RESERVED_ONOMANCY_KEY];
  if (typeof map !== "object" || map === null) return {};

  // Bare document references only. Anything else is absent rather than an
  // error, so one malformed edge cannot deny the rest of the namestore.
  // E8, per the path-resolution spec: a value that is not a reference is
  // absent from matching. The exclusion is **by value shape, never by key**.
  //
  // That distinction is load-bearing and easy to get backwards. Protocol data
  // lives under a `.well-known/` prefix by convention, so skipping that prefix
  // looks like the tidy way to exclude it — and would be wrong: the spec says
  // resolvers apply no special rule to the prefix, and "an entry under the
  // prefix whose value *is* a reference resolves like any other". Keying the
  // exclusion on the prefix would both under-exclude (non-reference values
  // elsewhere) and over-exclude (legitimate references under it).
  //
  // So the certificate list at `.well-known/onomancy/certificates` is skipped
  // here for one reason only: a list is not a reference. Nothing about its
  // name matters.
  const edges: NamestoreEdges = {};
  const malformed: string[] = [];
  for (const [path, target] of Object.entries(map)) {
    if (typeof target === "string" && isValidAutomergeUrl(target)) {
      edges[path] = target;
    } else {
      malformed.push(path);
    }
  }

  // E8's SHOULD: surface what was ignored. Silent exclusion is how a mistyped
  // reference becomes an unbound name with no way to tell the two apart.
  if (malformed.length > 0) {
    log.debug(
      `onomancy: ${url} has ${malformed.length} non-reference entr${
        malformed.length === 1 ? "y" : "ies"
      } (absent from matching): ${malformed.join(", ")}`
    );
  }
  return edges;
}

/**
 * The reserved location protocol data lives at, by writers' convention.
 *
 * Resolution attaches no meaning to this string — see the E8 note in
 * {@link edgesOf}. It is used only when *reading* certificates, which is a
 * different operation from walking names and is why it can name a key at all.
 */
export const CERTIFICATES_KEY = ".well-known/onomancy/certificates";

/**
 * The onomancy certificates a document carries, as raw `ONC\0` bytes.
 *
 * A document naming several hostnames carries several certificates, so this
 * returns all of them and leaves selection to the verifier: the ones for other
 * names are not failures, they are simply not this hostname's.
 *
 * Returns an empty list both when the document holds none and when it holds
 * something unreadable there. That is deliberate — "no certificate held" is an
 * absence rather than a security signal, and the two must not be conflated
 * with a chain that arrived and failed.
 */
export async function certificatesOf(
  repo: Repo,
  url: AutomergeUrl
): Promise<Uint8Array[]> {
  let doc: unknown;
  const abort = new AbortController();
  const giveUp = setTimeout(
    () => abort.abort(new Error("certificate read timed out")),
    HOP_TIMEOUT_MS
  );
  try {
    const handle = await repo.find<NamestoreDoc>(url, { signal: abort.signal });
    doc = handle.doc();
  } catch (error) {
    log.debug(`onomancy: could not read certificates from ${url}:`, error);
    return [];
  } finally {
    clearTimeout(giveUp);
  }

  if (typeof doc !== "object" || doc === null) return [];
  const map = (doc as Record<string, unknown>)[RESERVED_ONOMANCY_KEY];
  if (typeof map !== "object" || map === null) return [];

  const held = (map as Record<string, unknown>)[CERTIFICATES_KEY];
  if (!Array.isArray(held)) return [];

  return held.flatMap((entry) => (entry instanceof Uint8Array ? [entry] : []));
}

/**
 * Write one edge into a namestore.
 *
 * Which namestore is the caller's decision, and it is the anchor of the name
 * being bound that decides: `~` writes here, `@host` writes into whatever
 * document that domain designates, `automerge:` writes into that document.
 * Once the anchor has picked the document the write is identical, which is the
 * same symmetry the walk has.
 */
export async function bindEdge(
  repo: Repo,
  namestoreUrl: AutomergeUrl,
  path: string,
  target: AutomergeUrl
): Promise<void> {
  const handle = await repo.find<NamestoreDoc>(namestoreUrl);
  handle.change((doc) => {
    // Assign, then re-read. `(doc[K] ??= {})` evaluates to the plain object
    // that was assigned, NOT to the proxy Automerge installs in its place — so
    // writes through it land on a detached object and vanish, with no error.
    //
    // This has always worked here only because a namestore is created with the
    // reserved key already present, which makes `??=` short-circuit and return
    // the live proxy. It silently no-ops the first time the key is absent,
    // which is exactly what happened when a document was imported rather than
    // created (see devFixtures.ts).
    if (!doc[RESERVED_ONOMANCY_KEY]) doc[RESERVED_ONOMANCY_KEY] = {};
    const edges = doc[RESERVED_ONOMANCY_KEY];
    if (edges) edges[path] = target;
  });
}

/** Remove one edge, which is how a name is unbound. */
export async function unbindEdge(
  repo: Repo,
  namestoreUrl: AutomergeUrl,
  path: string
): Promise<void> {
  const handle = await repo.find<NamestoreDoc>(namestoreUrl);
  handle.change((doc) => {
    const edges = doc[RESERVED_ONOMANCY_KEY];
    if (edges) delete edges[path];
  });
}
