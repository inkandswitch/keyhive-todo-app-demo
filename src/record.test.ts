import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DOCUMENT_ID_BYTES,
  bindingRecord,
  parseBindingRecord,
  selectBinding,
  nextSerial,
} from "./record";

const documentId = fc
  .uint8Array({ minLength: DOCUMENT_ID_BYTES, maxLength: DOCUMENT_ID_BYTES })
  .map((bytes) => new Uint8Array(bytes));

// Any length: the generation key is not the thing the format constrains.
const generationKey = fc
  .uint8Array({ minLength: 1, maxLength: 64 })
  .map((bytes) => new Uint8Array(bytes));

const generation = fc.bigInt({ min: 0n, max: (1n << 64n) - 1n });

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

describe("selecting a binding from a TXT set", () => {
  const doc = (fill: number) => new Uint8Array(DOCUMENT_ID_BYTES).fill(fill);
  const key = new Uint8Array(32).fill(9);

  it("takes the highest generation regardless of wire order", () => {
    // The property that matters: DNS gives no meaning to set order, so the
    // answer must not depend on it. Any permutation, one answer.
    fc.assert(
      fc.property(
        fc.uniqueArray(generation, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 0, max: 5 }),
        (generations, seed) => {
          const records = generations.map((n) => bindingRecord(key, doc(1), n));
          const rotated = records.slice(seed).concat(records.slice(0, seed));
          const chosen = selectBinding(rotated);
          expect(chosen.status).toBe("bound");
          if (chosen.status === "bound") {
            expect(chosen.record.generation).toBe(
              generations.reduce((a, b) => (b > a ? b : a))
            );
          }
        }
      )
    );
  });

  it("orders serials past Number.MAX_SAFE_INTEGER", () => {
    // The u64 space runs well past 2^53, where `Number` stops distinguishing
    // neighbours: as doubles these two are equal. Comparing them as numbers
    // would make a genuine supersession look like a tie, and a tie is reported
    // as `contested` — so a domain that correctly superseded its own record
    // would be shown to every visitor as misconfigured. Failing safe, but
    // failing, and invisibly.
    const older = 18446744073709551614n;
    const newer = 18446744073709551615n;
    expect(Number(older)).toBe(Number(newer)); // the bug, if these were numbers

    const chosen = selectBinding([
      bindingRecord(key, doc(1), older),
      bindingRecord(key, doc(2), newer),
    ]);
    expect(chosen.status).toBe("bound");
    if (chosen.status === "bound") {
      expect(chosen.record.generation).toBe(newer);
      expect([...chosen.record.documentId]).toEqual([...doc(2)]);
    }
  });

  it("rejects a serial beyond the u64 the spec allows", () => {
    expect(
      parseBindingRecord(bindingRecord(key, doc(1), 1n << 64n))
    ).toBeUndefined();
    expect(
      parseBindingRecord(bindingRecord(key, doc(1), (1n << 64n) - 1n))
    ).toBeDefined();
  });

  it("refuses a contested newest generation rather than picking one", () => {
    // Two live claims at the same generation naming different documents. A
    // resolver that picks makes an invisible arbitrary choice; declining is
    // the only honest answer, and it must stay distinct from "unbound".
    const chosen = selectBinding([
      bindingRecord(key, doc(1), 7),
      bindingRecord(key, doc(2), 7),
    ]);
    expect(chosen.status).toBe("contested");
    if (chosen.status === "contested") {
      expect(chosen.generation).toBe(7n);
      expect(chosen.documents).toHaveLength(2);
    }
  });

  it("treats a duplicated record as agreement, not a contest", () => {
    const record = bindingRecord(key, doc(1), 7);
    expect(selectBinding([record, record]).status).toBe("bound");
  });

  it("lets an older record lose without contesting", () => {
    const chosen = selectBinding([
      bindingRecord(key, doc(1), 7),
      bindingRecord(key, doc(2), 6),
    ]);
    expect(chosen.status).toBe("bound");
    if (chosen.status === "bound") expect(chosen.record.generation).toBe(7n);
  });

  it("skips unparseable records rather than letting them deny the set", () => {
    const chosen = selectBinding([
      "v=SPF1 include:example.com",
      "",
      bindingRecord(key, doc(1), 3),
      "v=ONO0;k=x25519;n=9;g=AA==;p=AA==",
    ]);
    expect(chosen.status).toBe("bound");
    if (chosen.status === "bound") expect(chosen.record.generation).toBe(3n);
  });

  it("reports unbound for a set with nothing usable in it", () => {
    expect(selectBinding([]).status).toBe("unbound");
    expect(selectBinding(["v=SPF1", "junk"]).status).toBe("unbound");
  });
});

describe("the v=ONO0 binding record", () => {
  it("round-trips every field it carries", () => {
    fc.assert(
      fc.property(generationKey, documentId, generation, (key, doc, n) => {
        const parsed = parseBindingRecord(bindingRecord(key, doc, n));
        expect(parsed).toBeDefined();
        expect(parsed?.generation).toBe(n);
        expect([...(parsed?.generationKey ?? [])]).toEqual([...key]);
        expect([...(parsed?.documentId ?? [])]).toEqual([...doc]);
      })
    );
  });

  it("rejects a document id that is not a verifying key's length", () => {
    fc.assert(
      fc.property(
        generationKey,
        fc
          .uint8Array({ minLength: 0, maxLength: 64 })
          .filter((bytes) => bytes.length !== DOCUMENT_ID_BYTES),
        generation,
        (key, doc, n) => {
          const record = bindingRecord(key, new Uint8Array(doc), n);
          expect(parseBindingRecord(record)).toBeUndefined();
        }
      )
    );
  });

  it("rejects anything that is not a well-formed record", () => {
    // Unparseable is absent, never a throw: one malformed record among a
    // domain's several must not deny the others.
    fc.assert(
      fc.property(fc.string(), (junk) => {
        expect(() => parseBindingRecord(junk)).not.toThrow();
      })
    );

    for (const record of [
      "",
      "v=ONO1;k=ed25519;n=1;g=AA==;p=AA==",
      "v=ONO0;k=x25519;n=1;g=AA==;p=AA==",
      // Fields out of order.
      "v=ONO0;k=ed25519;n=1;p=AA==;g=AA==",
      // An unknown field appended.
      `${bindingRecord(new Uint8Array(32), new Uint8Array(32), 1)};x=1`,
      // A non-numeric generation.
      "v=ONO0;k=ed25519;n=abc;g=AA==;p=AA==",
    ]) {
      expect(parseBindingRecord(record)).toBeUndefined();
    }
  });

  it("reads the record brooklynzelenka.com actually publishes", () => {
    // Captured from a live DoH + DNSSEC resolution, so the format this app
    // writes is pinned against the one production already serves.
    const parsed = parseBindingRecord(
      "v=ONO0;k=ed25519;n=1787792719795;g=8XXKlRi7D9msSp8U4TZo0AzQ99InBDquIYprrW7NoI4=;p=nJ8I/xDYHbttOOpAzRaYFgGpvdtYmlGuXNsaNKWz+Us="
    );
    expect(parsed).toBeDefined();
    expect(parsed?.generation).toBe(1787792719795n);
    expect(hex(parsed?.documentId ?? new Uint8Array())).toBe(
      "9c9f08ff10d81dbb6d38ea40cd16981601a9bddb589a51ae5cdb1a34a5b3f94b"
    );
  });
});

describe("nextSerial", () => {
  it("never returns a value at or below the previous one", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: (1n << 63n) - 1n }),
        fc.bigInt({ min: 0n, max: (1n << 63n) - 1n }),
        (last, now) => {
          expect(nextSerial(last, now)).toBeGreaterThan(last);
        }
      )
    );
  });

  it("bumps on collision rather than tying", () => {
    // A tie between different documents is `contested`, so a publisher that
    // races itself within one millisecond would report its own name as
    // misconfigured.
    expect(nextSerial(1000n, 1000n)).toBe(1001n);
  });

  it("supersedes even when the clock has stepped backwards", () => {
    // Plain Date.now() loses here: the new record would rank below the one it
    // is meant to replace, and the stale binding stays live.
    expect(nextSerial(5000n, 4000n)).toBe(5001n);
  });

  it("tracks the clock when it is ahead, so serials stay wall-clock-like", () => {
    // Required by the poisoning bound: honest serials must grow at roughly
    // clock rate to overtake a serial planted ~5 minutes ahead.
    expect(nextSerial(1000n, 9000n)).toBe(9000n);
  });
});
