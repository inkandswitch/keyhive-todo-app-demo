import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AutomergeUrl } from "@automerge/react/slim";
import { longestMatch, walk, type NamestoreEdges } from "./walk";

// The walk never inspects a url beyond using it as a key, so a readable
// stand-in keeps failures legible.
const doc = (name: string) => `automerge:${name}` as AutomergeUrl;

const segment = fc
  .string({ minLength: 1, maxLength: 6 })
  .filter((s) => !s.includes("/"));
const segments = fc.array(segment, { minLength: 1, maxLength: 5 });

/** A lookup over a fixed set of documents; anything else is unheld. */
const held =
  (documents: Record<string, NamestoreEdges>) =>
  (url: AutomergeUrl): Promise<NamestoreEdges | undefined> =>
    Promise.resolve(documents[url]);

describe("longestMatch", () => {
  it("prefers the longest key when one is a prefix of another", () => {
    const edges: NamestoreEdges = {
      pics: doc("short"),
      "pics/vacation": doc("long"),
    };
    expect(longestMatch(edges, ["pics", "vacation"])?.path).toBe(
      "pics/vacation"
    );
    expect(longestMatch(edges, ["pics"])?.path).toBe("pics");
  });

  it("only ever matches at segment boundaries", () => {
    // "pic" is a string prefix of "pics" but not a segment prefix.
    expect(longestMatch({ pic: doc("a") }, ["pics"])).toBeUndefined();
  });

  it("never matches more segments than it was given", () => {
    fc.assert(
      fc.property(segments, (segs) => {
        const edges: NamestoreEdges = { [segs.join("/")]: doc("target") };
        const match = longestMatch(edges, segs.slice(0, -1));
        expect(match).toBeUndefined();
      })
    );
  });

  it("matches a key that is exactly a prefix of the segments", () => {
    fc.assert(
      fc.property(segments, fc.nat({ max: 4 }), (segs, extra) => {
        const key = segs.join("/");
        const edges: NamestoreEdges = { [key]: doc("target") };
        const query = [
          ...segs,
          ...Array.from({ length: extra }, (_, i) => `x${i}`),
        ];
        const match = longestMatch(edges, query);
        expect(match?.path).toBe(key);
        expect(match?.length).toBe(segs.length);
      })
    );
  });
});

describe("walk", () => {
  it("resolves a chain of single-segment edges", async () => {
    const documents: Record<string, NamestoreEdges> = {
      [doc("root")]: { a: doc("one") },
      [doc("one")]: { b: doc("two") },
      [doc("two")]: { c: doc("leaf") },
    };
    await expect(
      walk(held(documents), doc("root"), ["a", "b", "c"])
    ).resolves.toEqual({ status: "resolved", url: doc("leaf") });
  });

  it("returns the root itself for an empty path, without any lookup", async () => {
    // No lookup is registered, so a walk that touched one would report
    // `unsynced` instead.
    await expect(walk(held({}), doc("root"), [])).resolves.toEqual({
      status: "resolved",
      url: doc("root"),
    });
  });

  it("distinguishes an unheld document from a document with no edge", async () => {
    const unheld = await walk(held({}), doc("root"), ["a"]);
    expect(unheld).toMatchObject({ status: "partial", reason: "unsynced" });

    const dangling = await walk(held({ [doc("root")]: {} }), doc("root"), [
      "a",
    ]);
    expect(dangling).toMatchObject({ status: "partial", reason: "dangling" });
  });

  it("does not backtrack when the longest match dead-ends", async () => {
    // `pics` would resolve, but `pics/vacation` is longer and wins, and its
    // target holds nothing. A backtracking walk would fall back to `pics`
    // and consume one segment; this one stops.
    const documents: Record<string, NamestoreEdges> = {
      [doc("root")]: { pics: doc("short"), "pics/vacation": doc("long") },
      [doc("short")]: { vacation: doc("viaShort") },
      [doc("long")]: {},
    };
    await expect(
      walk(held(documents), doc("root"), ["pics", "vacation"])
    ).resolves.toEqual({
      status: "resolved",
      url: doc("long"),
    });

    const documentsDeadEnd: Record<string, NamestoreEdges> = {
      ...documents,
      [doc("long")]: { other: doc("x") },
    };
    const outcome = await walk(held(documentsDeadEnd), doc("root"), [
      "pics",
      "vacation",
      "more",
    ]);
    expect(outcome).toMatchObject({
      status: "partial",
      reason: "dangling",
      at: doc("long"),
    });
  });

  it("reports consumed no greater than total, always", async () => {
    await fc.assert(
      fc.asyncProperty(segments, fc.nat({ max: 3 }), async (segs, depth) => {
        // A chain that runs out part way through the requested segments.
        const documents: Record<string, NamestoreEdges> = {};
        let previous = doc("root");
        for (let i = 0; i < Math.min(depth, segs.length); i++) {
          const next = doc(`step${i}`);
          documents[previous] = { [segs[i]]: next };
          previous = next;
        }
        documents[previous] ??= {};

        const outcome = await walk(held(documents), doc("root"), segs);
        if (outcome.status === "partial") {
          expect(outcome.total).toBe(segs.length);
          expect(outcome.consumed).toBeLessThanOrEqual(outcome.total);
          expect(outcome.consumed).toBeGreaterThanOrEqual(0);
        }
      })
    );
  });
});
