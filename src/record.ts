// The `v=ONO0` DNS binding record.
//
// Pure wire format: no onomancy, no automerge, no DOM beyond base64. Kept
// apart from onomancy.ts so the format can be exercised without loading a Wasm
// module, and because writing a record and reading one back are two halves of
// a single definition that should not drift.

/** A document id is an ed25519 verifying key, so always exactly this long. */
export const DOCUMENT_ID_BYTES = 32;

/**
 * Strict within the known tag, per the DNS anchoring spec: exact field order,
 * known fields only. Anything else is not a v=ONO0 record.
 */
const RECORD =
  /^v=ONO0;k=ed25519;n=(\d+);g=([A-Za-z0-9+/]+={0,2});p=([A-Za-z0-9+/]+={0,2})$/;

/**
 * The largest `n=` the spec allows: the field is a u64.
 *
 * Held as `bigint` rather than `number` deliberately. The u64 space runs past
 * `Number.MAX_SAFE_INTEGER`, where `Number` silently equates neighbouring
 * values — so two records serialled `...614` and `...615` would compare equal,
 * turning a supersession into a tie and a tie into `contested`. That fails
 * safe, but it fails: a domain that correctly superseded its own record would
 * be reported as misconfigured. Rejecting such serials as malformed is no
 * better, since they are legitimate.
 */
const MAX_GENERATION = (1n << 64n) - 1n;

export interface BindingRecord {
  /**
   * Monotonic counter, letting a resolver order records seen out of order.
   * A u64, so `bigint` — see {@link MAX_GENERATION}.
   */
  generation: bigint;
  /** The identity that published the binding. */
  generationKey: Uint8Array;
  /** The document the domain designates. */
  documentId: Uint8Array;
}

/**
 * The next serial to publish, per the DNS binding design's publisher rule:
 * `max(now_ms, last + 1)`.
 *
 * Wall-clock alone is not enough, in two directions. Two records minted in the
 * same millisecond tie — and a tie between different documents is `contested`,
 * so a publisher racing itself reports its own name as misconfigured. A clock
 * that steps backwards is worse: the new record loses to the one it was meant
 * to supersede, and the old binding stays live.
 *
 * Bumping on collision keeps serials monotone while still tracking wall clock,
 * which matters beyond tidiness: the poisoning defence assumes honest serials
 * grow at roughly clock rate, so that a serial planted at most ~5 minutes
 * ahead is overtaken within the skew window. A publisher whose serials do not
 * track the clock cannot outgrow poison on schedule.
 */
export function nextSerial(
  last: bigint | null,
  now: bigint = BigInt(Date.now())
): bigint {
  if (last === null) return now;
  return now > last ? now : last + 1n;
}

/**
 * The record a domain publishes at `_onomancy.<domain>`.
 *
 * Pass a serial from {@link nextSerial} rather than a bare `Date.now()`, so
 * republishing cannot tie with or lose to its own predecessor.
 */
export function bindingRecord(
  generationKey: Uint8Array,
  documentId: Uint8Array,
  // `bigint` accepted so a caller can mint a serial anywhere in the u64 space,
  // which the parser now reads. `Date.now()` stays the ordinary source.
  now: number | bigint = Date.now()
): string {
  return [
    "v=ONO0",
    "k=ed25519",
    `n=${now}`,
    `g=${bytesToBase64(generationKey)}`,
    `p=${bytesToBase64(documentId)}`,
  ].join(";");
}

/**
 * Read a record back, or `undefined` when it is not a well-formed one.
 *
 * Unparseable is absent rather than an error, so one malformed record among a
 * domain's several cannot deny the others.
 */
export function parseBindingRecord(record: string): BindingRecord | undefined {
  const match = record.match(RECORD);
  if (!match) return undefined;

  // The regex already guarantees digits only, so this cannot throw.
  const generation = BigInt(match[1]);
  if (generation > MAX_GENERATION) return undefined;

  const generationKey = base64ToBytes(match[2]);
  const documentId = base64ToBytes(match[3]);
  if (generationKey === undefined || documentId === undefined) return undefined;
  if (documentId.length !== DOCUMENT_ID_BYTES) return undefined;

  return { generation, generationKey, documentId };
}

/**
 * Which binding a domain's records designate, or why no answer is available.
 *
 * A domain publishes a TXT *set*, and DNS gives no meaning to the order of a
 * set: the wire order varies by resolver, so `records[0]` answers a different
 * question on different networks with no error anywhere. Selection has to be a
 * decision over the parsed set, and this is that decision.
 */
export type Binding =
  | { status: "bound"; record: BindingRecord }
  /** No record parsed. The domain publishes nothing usable here. */
  | { status: "unbound" }
  /**
   * The newest generation is claimed by records naming different documents.
   * Deliberately NOT resolved: picking one would make an arbitrary choice
   * between two live claims, and a resolver that guesses is worse than one
   * that declines, because the guess is invisible. Distinguishing this from
   * `unbound` matters — a contested name is misconfigured, not unclaimed.
   */
  | { status: "contested"; generation: bigint; documents: Uint8Array[] };

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * The binding a set of TXT records designates.
 *
 * Highest generation wins: `n=` exists so a resolver can order records seen
 * out of order, and the spec makes the highest normative within one set.
 * Unparseable records are skipped rather than fatal, so a stray TXT beside the
 * onomancy one cannot deny the domain.
 */
export function selectBinding(records: string[]): Binding {
  const parsed = records
    .map(parseBindingRecord)
    .filter((record): record is BindingRecord => record !== undefined);

  if (parsed.length === 0) return { status: "unbound" };

  // Not `Math.max`: these are bigints, and `Math.max` would coerce them back
  // through `number` — reintroducing the precision loss the bigint is here to
  // avoid, at the one comparison that decides the outcome.
  const generation = parsed.reduce(
    (highest, record) =>
      record.generation > highest ? record.generation : highest,
    parsed[0].generation
  );
  const newest = parsed.filter((record) => record.generation === generation);

  // Duplicates of one binding are not a disagreement: a domain may legitimately
  // publish the same record twice, and two identical answers agree.
  const documents: Uint8Array[] = [];
  for (const record of newest) {
    if (!documents.some((seen) => sameBytes(seen, record.documentId))) {
      documents.push(record.documentId);
    }
  }

  if (documents.length > 1)
    return { status: "contested", generation, documents };
  return { status: "bound", record: newest[0] };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}
