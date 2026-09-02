// The onomancy runtime: name parsing and live DNS anchoring.
//
// Onomancy is Wasm-backed, so this module is the only route by which it
// reaches the app, the same arrangement keyhiveRuntime.ts gives ARK. Unlike
// the automerge and keyhive packages there is no duplicate to guard against:
// nothing else depends on onomancy, and every entry variant it publishes
// re-exports the same web-target bindings.
//
// What lives here is the part of onomancy that is pure grammar and DNS. The
// walk over documents lives in names.ts, because the documents are ours: the
// package also ships a `HeldDocuments` substrate that would do the walk in
// Wasm, but it replicates by hand (`hold`/`save` of raw bytes) and would mean
// copying every hop out of the repo and back. Replication is the substrate's
// job, and our substrate is automerge-repo under keyhive.

import {
  stringifyAutomergeUrl,
  type AutomergeUrl,
  type BinaryDocumentId,
} from "@automerge/react/slim";
import { Name, resolveHostname, setup } from "@inkandswitch/onomancy";
import { log } from "./log";
import { parseBindingRecord, selectBinding } from "./record";

// The wire format is re-exported so callers have one import for "onomancy
// things", even though its definition is kept dependency-free next door.
export { bindingRecord, parseBindingRecord } from "./record";
export type { BindingRecord } from "./record";

/** Panic reporting in the browser console. Safe to call more than once. */
let didSetup = false;
export function initOnomancy(): void {
  if (didSetup) return;
  didSetup = true;
  setup();
}

/**
 * Where a name's walk begins, and what makes its result trustworthy.
 *
 * The three anchors are disjoint by construction, so a parsed name can never
 * be ambiguous about which trust root it started from.
 */
export type NameAnchor =
  | { kind: "local" }
  | { kind: "dns"; hostname: string }
  | { kind: "doc"; url: AutomergeUrl };

export interface ParsedName {
  anchor: NameAnchor;
  /** One edge hop each. Empty for a bare anchor such as `~`. */
  segments: string[];
  /** The canonical printed form, as the grammar normalizes it. */
  value: string;
}

export type ParseResult =
  { ok: true; name: ParsedName } | { ok: false; error: string };

/**
 * Parse a name through onomancy's own grammar.
 *
 * A leading sigil is required by the grammar, since the anchor is what decides
 * how much a resolution is worth. As a typing convenience a sigil-less string
 * is read as a local name, but the canonical spelling is what gets reported
 * back, so `todos/groceries` binds and then displays as `~/todos/groceries`.
 */
export function parseName(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Enter a name." };

  const sigilled =
    trimmed.startsWith("~") ||
    trimmed.startsWith("@") ||
    trimmed.startsWith("automerge:")
      ? trimmed
      : `~/${trimmed}`;

  let name: Name;
  try {
    name = new Name(sigilled);
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }

  // A Name owns Wasm memory, so read everything out and hand back plain JS.
  try {
    const anchor = name.anchor;
    const parsed: ParsedName = {
      anchor: anchorOf(name.anchorKind, anchor),
      segments: [...name.segments],
      value: name.value,
    };
    return { ok: true, name: parsed };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  } finally {
    name.free();
  }
}

function anchorOf(kind: string, anchor: string): NameAnchor {
  switch (kind) {
    case "local":
      return { kind: "local" };
    case "dns":
      // Printed with its sigil; the hostname is what DNS is asked about.
      return { kind: "dns", hostname: anchor.replace(/^@/, "") };
    case "doc":
      return { kind: "doc", url: anchor as AutomergeUrl };
    default:
      // The grammar has exactly three anchor kinds. A fourth means this build
      // of the app and its onomancy disagree about the name grammar.
      throw new Error(`Unknown onomancy anchor kind: "${kind}"`);
  }
}

/**
 * The root documents a hostname's `_onomancy` TXT records designate.
 *
 * The chain is fetched over DNS-over-HTTPS and validated inside the Wasm from
 * the IANA root keys baked into it, so the transport is untrusted and the
 * answer is checked locally. Rejects on malformed hostnames, transport
 * failures, and invalid chains.
 */
export async function resolveBoundDocuments(
  hostname: string
): Promise<AutomergeUrl[]> {
  const outcome = await resolveHostname(hostname, null);
  const records = recordsOf(outcome);
  log.debug(`onomancy: ${hostname} published ${records.length} record(s)`);

  // The chain's own verdict on its validity window, which onomancy grades and
  // hands back rather than acting on. Dropping it would mean a replayed chain
  // whose signatures are intact but whose window has lapsed resolves as
  // current — signature validity without time validity.
  //
  // `stale` does NOT block. A lapsed window is a risk signal, never a forgery
  // signal: the binding is still shown, because refusing it would break the
  // offline case the design exists to serve, and because the clock making the
  // judgement is the user's browser and may simply be wrong.
  const grade = freshnessOf(outcome);
  if (grade && grade !== "fresh") {
    log.warn(
      `onomancy: ${hostname} chain is ${grade} — ` +
        (grade === "deferred"
          ? "its validity window has not opened, most often a local clock ahead of real time"
          : "its validity window has lapsed; the binding is shown but may have been superseded")
    );
  }

  const binding = selectBinding(records);
  switch (binding.status) {
    case "unbound":
      return [];

    case "contested":
      // Two live claims at the newest generation. Returning either would make
      // an arbitrary choice invisible to the caller, so return neither and say
      // why: a contested name is misconfigured, not unclaimed.
      log.error(
        `onomancy: ${hostname} publishes ${binding.documents.length} different documents at generation ${binding.generation}; refusing to choose between them`
      );
      return [];

    case "bound": {
      const url = urlFromDocumentId(binding.record.documentId);
      return url ? [url] : [];
    }
  }
}

function recordsOf(outcome: unknown): string[] {
  if (typeof outcome !== "object" || outcome === null) return [];
  const records = (outcome as { records?: unknown }).records;
  if (!Array.isArray(records)) return [];
  return records.filter(
    (record): record is string => typeof record === "string"
  );
}

/*
 * `verifyCertificate` reports refusal by THROWING, not by returning a verdict.
 * A catch that treats exceptions as transport failures reads "this key was
 * revoked" as "the network is down" and retries forever against a certificate
 * that cannot verify while the chain stays fresh. Distinguish refusal from
 * transport before adding any retry: a `RefusalError` carries `reason`.
 *
 * Strictness rises with freshness, which is easy to get backwards. A fresh
 * chain is authoritative enough to convict, so an off-path signer on one is
 * refused outright; the same certificate on a stale chain grades
 * `provisional`.
 */

/**
 * The chain's freshness grade.
 *
 * Typed as required since onomancy 0.2.0, but read structurally anyway: this
 * is a wasm boundary and the probe is a line. Absence means "did not grade",
 * never "not fresh".
 */
function freshnessOf(outcome: unknown): string | undefined {
  if (typeof outcome !== "object" || outcome === null) return undefined;
  const grade = (outcome as { freshness?: unknown }).freshness;
  return typeof grade === "string" ? grade : undefined;
}

/**
 * The root document one TXT record binds, or `undefined` when the record is
 * not a well-formed `v=ONO0` record.
 *
 * Parsing is strict within the known tag, per the DNS anchoring spec: exact
 * field order and known fields only. An unparseable record is absent rather
 * than an error, so one malformed record cannot deny the others.
 */
export function boundDocumentOf(record: string): AutomergeUrl | undefined {
  const parsed = parseBindingRecord(record);
  return parsed ? urlFromDocumentId(parsed.documentId) : undefined;
}

/**
 * A bound document id, as `HostnameBinding.ids` reports it, as a url.
 *
 * The runtime hands back hex — a document id is an ed25519 verifying key, and
 * hex is how it crosses the Wasm boundary. Anything that is not 32 bytes of
 * hex is not a document id, and returns `undefined` rather than throwing: a
 * malformed entry among several must not deny the others.
 */
export function documentUrlFromHex(hex: string): AutomergeUrl | undefined {
  const bare = (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(bare)) return undefined;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(bare.slice(i * 2, i * 2 + 2), 16);
  }
  return urlFromDocumentId(bytes);
}

function urlFromDocumentId(documentId: Uint8Array): AutomergeUrl | undefined {
  try {
    // BinaryDocumentId is a branded Uint8Array, and the brand is exactly the
    // 32-byte check parseBindingRecord already made. Asserting it here is what
    // turns checked bytes into a document id, so this is where the cast
    // belongs.
    return stringifyAutomergeUrl(documentId as BinaryDocumentId);
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}
