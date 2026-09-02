// Petnames: your labels for other people, in a document only you can write.
//
// The phonebook is a shared unprotected map that everyone writes everyone's
// names into — global and memorable with no authority at all, which is why the
// app has to warn that names are forgeable. Forgeability is a property of that
// document's shape, not of naming.
//
// Onomancy's petname anchoring: a `~` name proves that you, holding the keys
// to your own root document, bound this label to this reference. Nobody else
// can write that document, so nobody else can forge the label. This applies
// the same move to people rather than documents.
//
// It does not solve discovery — a petname means nothing to anyone who did not
// assign it — so this layers over the phonebook rather than replacing it.
//
// Your own entry still goes to the phonebook, because labelling someone else
// and publishing your own name are opposite operations: the first is private
// and authoritative, the second is an assertion others must be able to reach.

import type { AutomergeUrl, Repo } from "@automerge/react/slim";
import type { DirectoryEntry, NameDirectory } from "@automerge/keyhive-react";
import { useEffect, useMemo, useState } from "react";
import { log } from "./log";
import type { NamestoreDoc } from "./namestore";

/**
 * Where petnames live in the namestore.
 *
 * A sibling of the reserved `onomancy` map, not inside it: that map holds
 * name-to-document edges the resolver walks, and a label for a person is
 * neither a name nor a document reference. Keeping them apart means a petname
 * can never be mistaken for an edge, whatever future edge parsing does.
 */
export const PETNAMES_KEY = "petnames";

export interface Petname {
  name?: string;
  avatar?: Uint8Array | null;
}

export type PetnameMap = Record<string, Petname>;

type PetnameDoc = NamestoreDoc & { [PETNAMES_KEY]?: PetnameMap };

function bareId(id: string): string {
  return (id.startsWith("0x") ? id.slice(2) : id).toLowerCase();
}

/** Write a label for `id` into this identity's own namestore. */
export async function setPetname(
  repo: Repo,
  namestoreUrl: AutomergeUrl,
  id: string,
  petname: Petname
): Promise<void> {
  const handle = await repo.find<PetnameDoc>(namestoreUrl);
  handle.change((doc) => {
    // Assign then re-read: `??=` yields the plain object, not the proxy.
    if (!doc[PETNAMES_KEY]) doc[PETNAMES_KEY] = {};
    const map = doc[PETNAMES_KEY];
    if (!map) return;
    const key = bareId(id);
    const existing = map[key] ?? {};
    // An empty name clears the label rather than storing a blank one, so
    // "remove my petname" and "set it to nothing" are the same gesture.
    if (petname.name !== undefined) {
      if (petname.name.trim() === "") delete map[key];
      else map[key] = { ...existing, name: petname.name };
    }
    if (petname.avatar !== undefined && map[key]) {
      map[key] = { ...map[key], avatar: petname.avatar };
    }
  });
}

/** This identity's petnames, live. */
export function usePetnames(
  repo: Repo,
  namestoreUrl: AutomergeUrl | null
): PetnameMap {
  const [map, setMap] = useState<PetnameMap>({});

  useEffect(() => {
    if (!namestoreUrl) {
      setMap({});
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const handle = await repo.find<PetnameDoc>(namestoreUrl);
        const read = () => {
          if (!cancelled) setMap({ ...(handle.doc()?.[PETNAMES_KEY] ?? {}) });
        };
        read();
        handle.on("change", read);
        return () => handle.off("change", read);
      } catch (error) {
        log.debug("petnames: could not read the namestore:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repo, namestoreUrl]);

  return map;
}

/**
 * `base`, with this identity's petnames taking precedence.
 *
 * Reads prefer a petname where one exists and fall through otherwise, so
 * discovery still works for people you have never labelled. Writes are routed
 * by subject: your own entry to `base` — it is an assertion for others to read
 * — and everyone else's to your namestore, where nobody can alter it.
 */
export function usePetnameDirectory(
  repo: Repo,
  base: NameDirectory,
  namestoreUrl: AutomergeUrl | null,
  selfId: string
): NameDirectory {
  const petnames = usePetnames(repo, namestoreUrl);

  return useMemo(() => {
    const decorate = (entry: DirectoryEntry): DirectoryEntry => {
      const mine = petnames[bareId(entry.id)];
      if (!mine) return entry;
      return {
        ...entry,
        ...(mine.name !== undefined ? { name: mine.name } : {}),
        ...(mine.avatar !== undefined ? { avatar: mine.avatar } : {}),
      };
    };

    const directory: NameDirectory = {
      source: `petnames+${base.source}`,
      trust: base.trust,
      writable: base.writable,
      enumerable: base.enumerable,
      notice: base.notice,

      lookup(id) {
        const entry = base.lookup(id);
        if (entry) return decorate(entry);
        // Somebody labelled but absent from the shared map is still someone
        // you named, and dropping them would lose the only record of it.
        const mine = petnames[bareId(id)];
        return mine ? { id, name: mine.name, avatar: mine.avatar } : undefined;
      },

      list() {
        const seen = new Set<string>();
        const entries = base.list().map((entry) => {
          seen.add(bareId(entry.id));
          return decorate(entry);
        });
        for (const [id, mine] of Object.entries(petnames)) {
          if (!seen.has(id)) {
            entries.push({ id, name: mine.name, avatar: mine.avatar });
          }
        }
        return entries;
      },

      subscribe: base.subscribe?.bind(base),
    };

    const basePublish = base.publish?.bind(base);
    if (basePublish) {
      directory.publish = async (entry) => {
        // Your own profile is an assertion for other people, so it belongs in
        // the shared map where they can read it. It stays self-asserted and
        // forgeable, which is what that document is.
        if (bareId(entry.id) === bareId(selfId)) return basePublish(entry);

        // A label for somebody else is yours alone.
        if (!namestoreUrl) {
          throw new Error("No namestore yet, so a petname cannot be stored.");
        }
        await setPetname(repo, namestoreUrl, entry.id, {
          name: entry.name,
          avatar: entry.avatar,
        });
      };
    }

    return directory;
  }, [repo, base, petnames, namestoreUrl, selfId]);
}
