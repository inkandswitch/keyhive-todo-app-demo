// Resolving a name to a document.
//
// The walk itself lives in walk.ts, pure and substrate-free. This module binds
// it to the demo's substrate: automerge-repo for reading documents, onomancy
// for the DNS anchor.

import type { AutomergeUrl, Repo } from "@automerge/react/slim";
import { edgesOf } from "./namestore";
import { resolveBoundDocuments, type ParsedName } from "./onomancy";
import { walk, type Resolution } from "./walk";

export type {
  EdgeLookup,
  NamestoreEdges,
  PartialReason,
  Resolution,
} from "./walk";

/** Walk `segments` from `root` over the documents this repo holds. */
export async function resolvePath(
  repo: Repo,
  root: AutomergeUrl,
  segments: string[]
): Promise<Resolution> {
  return walk((url) => edgesOf(repo, url), root, segments);
}

/**
 * Resolve a parsed name.
 *
 * The anchor decides only where the walk starts, and how much the answer is
 * worth: a `~` name is trustworthy because it started from a document we hold,
 * a `@host` name because a DNSSEC chain from the IANA root said where to
 * start. After that the three are the same walk.
 *
 * `localRoot` is this identity's namestore, needed only for `~` names.
 */
export interface NameResolution {
  /**
   * The document the walk started from.
   *
   * Carried out rather than discarded because it is the document a `@host`
   * name's certificate lives in — the one DNS designates, not the one the walk
   * ends at. Recomputing it would mean a second DoH round trip and, worse,
   * would invite verifying the certificate against the wrong document: the
   * final target is whatever the last edge pointed at, which has no claim on
   * the hostname and no reason to carry evidence about it.
   */
  root: AutomergeUrl;
  resolution: Resolution;
}

export async function resolveName(
  repo: Repo,
  name: ParsedName,
  localRoot: AutomergeUrl | null
): Promise<NameResolution> {
  const root = await rootOf(name, localRoot);
  return { root, resolution: await resolvePath(repo, root, name.segments) };
}

/**
 * The document a name's anchor starts from.
 *
 * Throws rather than returning a partial: a name whose anchor cannot be
 * established has not begun to resolve, which is a different thing from a walk
 * that got part way and can report how far it got.
 */
export async function rootOf(
  name: ParsedName,
  localRoot: AutomergeUrl | null
): Promise<AutomergeUrl> {
  switch (name.anchor.kind) {
    case "local":
      if (!localRoot) {
        throw new Error("This identity has no namestore yet.");
      }
      return localRoot;

    case "doc":
      return name.anchor.url;

    case "dns": {
      const { hostname } = name.anchor;
      // At most one: `resolveBoundDocuments` selects by generation and
      // declines to choose when the newest is contested, so there is no
      // "first" to take here and no wire order to depend on.
      const [root] = await resolveBoundDocuments(hostname);
      if (root === undefined) {
        throw new Error(
          `${hostname} publishes no usable onomancy binding. It needs a DNSSEC-signed _onomancy TXT record.`
        );
      }
      return root;
    }
  }
}

/** How far a partial walk got, in words a reader can act on. */
export function describePartial(
  resolution: Extract<Resolution, { status: "partial" }>
): string {
  const { consumed, total, reason } = resolution;
  const got =
    consumed === 0
      ? "No part of that name resolved"
      : `Only ${consumed} of ${total} segment${total === 1 ? "" : "s"} resolved`;

  return reason === "unsynced"
    ? `${got}: the next document has not synced to this device yet, so the rest of the name cannot be read. This is not evidence that the name is unbound.`
    : `${got}: the document it stopped at has no edge for what remains, so nothing is bound there.`;
}
