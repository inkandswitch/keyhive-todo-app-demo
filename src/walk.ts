// The path-resolution walk, with the substrate held at arm's length.
//
// Reading documents is injected rather than imported, so the algorithm here is
// pure and testable on plain maps while names.ts supplies the automerge-repo
// backed lookup. That split is onomancy's own: the resolution machinery is
// sans-IO, and replication belongs to the substrate.

import type { AutomergeUrl } from "@automerge/react/slim";

/** Path (segments joined by `/`) to the document that path names. */
export type NamestoreEdges = Record<string, AutomergeUrl>;

/**
 * Reads one document's edges. `undefined` means the document is not held here,
 * which is different from a document held with nothing bound in it.
 */
export type EdgeLookup = (
  url: AutomergeUrl
) => Promise<NamestoreEdges | undefined>;

/**
 * Why a walk stopped short.
 *
 * - `unsynced`: the next document is not held here. Nothing is proven about
 *   the name; a replica may arrive and the same walk finish.
 * - `dangling`: the document is held and simply has no edge for what remains.
 *   That is an answer: nothing is bound there.
 */
export type PartialReason = "unsynced" | "dangling";

export type Resolution =
  | { status: "resolved"; url: AutomergeUrl }
  | {
      status: "partial";
      consumed: number;
      total: number;
      reason: PartialReason;
      /** The document the walk stopped at. */
      at: AutomergeUrl;
    };

/**
 * The longest key matching a prefix of `segments`, at segment boundaries.
 *
 * A namestore holding both `pics` and `pics/vacation` sends `pics/vacation`
 * down the longer edge. Longest-match is what lets one document delegate a
 * whole subtree to another while still naming individual things beside it.
 */
export function longestMatch(
  edges: NamestoreEdges,
  segments: string[]
): { path: string; length: number } | undefined {
  let best: { path: string; length: number } | undefined;

  for (const path of Object.keys(edges)) {
    const parts = path.split("/");
    if (parts.length > segments.length) continue;
    if (!parts.every((part, i) => part === segments[i])) continue;
    if (!best || parts.length > best.length) {
      best = { path, length: parts.length };
    }
  }
  return best;
}

/**
 * Walk `segments` from `root`, one hop per matched edge.
 *
 * Greedy and without backtracking: if the longest match dead-ends, the walk
 * stops rather than retrying a shorter one. That keeps resolution linear in
 * the path length and makes an edge's meaning independent of what else the
 * namestore happens to contain.
 */
export async function walk(
  lookup: EdgeLookup,
  root: AutomergeUrl,
  segments: string[]
): Promise<Resolution> {
  const total = segments.length;
  let current = root;
  let consumed = 0;
  let remaining = segments;

  while (remaining.length > 0) {
    const edges = await lookup(current);
    if (edges === undefined) {
      return {
        status: "partial",
        consumed,
        total,
        reason: "unsynced",
        at: current,
      };
    }

    const match = longestMatch(edges, remaining);
    if (!match) {
      return {
        status: "partial",
        consumed,
        total,
        reason: "dangling",
        at: current,
      };
    }

    current = edges[match.path];
    consumed += match.length;
    remaining = remaining.slice(match.length);
  }

  return { status: "resolved", url: current };
}
