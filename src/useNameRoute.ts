// Names in the location hash.
//
// The hash already carries two things: a document id, and an `#invite=`
// payload. A name is the third. They stay distinguishable because a document
// id and an invite are both recognized before a name is attempted, and the
// name grammar requires a leading sigil, so nothing that is one can be read as
// another.
//
// Resolution is asynchronous and can legitimately stop part way, so a route
// has more states than "loading" and "loaded". A partial walk is reported as
// such rather than flattened into an error, because the two mean different
// things to whoever typed the name.

import { AutomergeUrl, Repo, isValidAutomergeUrl } from "@automerge/react/slim";
import { useEffect, useState } from "react";
import { inviteFromHash } from "./invite";
import { resolveName, type Resolution } from "./names";
import { parseName, type ParsedName } from "./onomancy";
import { errorMessage, log } from "./log";

export type NameRoute =
  | { status: "none" }
  | { status: "resolving"; name: ParsedName }
  | {
      status: "resolved";
      name: ParsedName;
      url: AutomergeUrl;
      /** The document the walk began at — where a `@host` certificate lives. */
      root: AutomergeUrl;
    }
  | {
      status: "partial";
      name: ParsedName;
      resolution: Extract<Resolution, { status: "partial" }>;
    }
  | { status: "error"; raw: string; message: string };

/**
 * Whether a hash should be read as a name at all.
 *
 * Document ids and invites are not names, and an empty hash is not anything.
 */
function nameInHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "").trim();
  if (raw === "") return null;
  if (isValidAutomergeUrl(raw)) return null;
  if (inviteFromHash(hash)) return null;
  return raw;
}

/**
 * Resolve the name in `hash`, if it holds one.
 *
 * `localRoot` is this identity's namestore. Resolution waits for it rather
 * than failing, since on a first run the namestore is still being created
 * while the hash is already set.
 */
export function useNameRoute(
  repo: Repo,
  hash: string,
  localRoot: AutomergeUrl | null
): NameRoute {
  const [route, setRoute] = useState<NameRoute>({ status: "none" });

  useEffect(() => {
    const raw = nameInHash(hash);
    if (raw === null) {
      setRoute({ status: "none" });
      return;
    }

    const parsed = parseName(raw);
    if (!parsed.ok) {
      setRoute({ status: "error", raw, message: parsed.error });
      return;
    }
    const name = parsed.name;

    // A `~` name cannot start until the namestore exists. Stay in `resolving`
    // rather than reporting a failure: this effect reruns when it arrives.
    if (name.anchor.kind === "local" && !localRoot) {
      setRoute({ status: "resolving", name });
      return;
    }

    let cancelled = false;
    setRoute({ status: "resolving", name });

    resolveName(repo, name, localRoot)
      .then(({ root, resolution }) => {
        if (cancelled) return;
        setRoute(
          resolution.status === "resolved"
            ? { status: "resolved", name, url: resolution.url, root }
            : { status: "partial", name, resolution }
        );
      })
      .catch((error: unknown) => {
        log.error(`Could not resolve ${name.value}:`, error);
        if (!cancelled) {
          setRoute({
            status: "error",
            raw,
            message: errorMessage(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repo, hash, localRoot]);

  return route;
}
