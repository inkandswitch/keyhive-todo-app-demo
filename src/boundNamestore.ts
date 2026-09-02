// Building and moving a DNS-bound namestore.
//
// A namestore that a domain designates cannot be an ARK document. Onomancy
// requires a self-certifying ed25519 anchor; ARK reads that shape as
// keyhive-protected; a document minted outside keyhive has no keyhive state,
// so it can never be granted relay and never replicates (ADR-023).
//
// The way through is that it does not have to replicate. An Automerge document
// is bytes, and a certificate is self-authenticating, so the whole binding
// travels as a file: build it once, export it, and anyone who imports it can
// verify the name from their own trust anchors without trusting the courier.
// That is the same property onomancy's own demo relies on — hand replication,
// which is immune to ARK's classifier because it never consults one.
//
// So this module is a *builder*, not a sync path. Nothing here makes a
// namestore reachable to someone you have not handed bytes to.

import {
  interpretAsDocumentId,
  isValidAutomergeUrl,
  type AutomergeUrl,
  type Repo,
} from "@automerge/react/slim";
import {
  CERTIFICATES_KEY,
  RESERVED_ONOMANCY_KEY,
  type NamestoreDoc,
} from "./namestore";
import { log } from "./log";

/**
 * A deterministic Automerge document that materializes to an empty map.
 *
 * Importing these bytes under a chosen id is what puts a document *at* an id
 * that keyhive never generated. Same constant `phonebook.ts` uses to seed a
 * well-known document; every importer producing the same root is what lets
 * later writes merge rather than fork.
 */
const EMPTY_DOC_BASE64 =
  "hW9Kgy+PHqIAcgEEAAAAAAEe1Lktwc6gvC/3MqqGTwH/up5olcGuWqIiF/a/aRxohwYBAgMCEwIjBkACVgIJFQghAiMCNAFCAlYCgAECgQECgwECfwB/AX8Cf+CxutIGfwB/B38GX19zZWVkfwB/AQF/AX8CfwF/AH8CAA==";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface BoundNamestoreSpec {
  /** The `automerge:` anchor the TXT record's `p=` field designates. */
  document: AutomergeUrl | string;
  /** Raw `ONC\0` bytes, chained. A chainless certificate cannot verify. */
  certificate: Uint8Array;
  /** Path to target, e.g. `{ "todos/groceries": "automerge:..." }`. */
  edges: Record<string, string>;
}

export interface BuildResult {
  document: AutomergeUrl;
  certificateBytes: number;
  edges: string[];
}

/**
 * Create or update the document a domain's TXT record designates.
 *
 * The certificate's `root_doc` must equal this document, so `document` has to
 * be the anchor the ceremony derived — a certificate pasted into some other
 * document refuses with a mismatch, which is the failure this argument exists
 * to prevent being silent.
 *
 * Idempotent: re-running replaces the certificate and merges the edges.
 */
export async function buildBoundNamestore(
  repo: Repo,
  spec: BoundNamestoreSpec
): Promise<BuildResult> {
  const url = String(spec.document) as AutomergeUrl;
  if (!isValidAutomergeUrl(url)) {
    throw new Error(`Not a valid Automerge url: ${spec.document}`);
  }
  for (const [path, target] of Object.entries(spec.edges)) {
    if (!isValidAutomergeUrl(target)) {
      throw new Error(
        `Edge "${path}" does not name a valid document: ${target}`
      );
    }
  }

  repo.import(base64ToBytes(EMPTY_DOC_BASE64), {
    docId: interpretAsDocumentId(url),
  });

  const handle = await repo.find<NamestoreDoc>(url);
  handle.change((doc) => {
    // Assign then re-read. `(doc[K] ??= {})` evaluates to the plain object
    // assigned, not the proxy Automerge installs, so writes through it vanish
    // silently. Only reachable when the key is genuinely absent, which is
    // exactly the case for an imported document.
    if (!doc[RESERVED_ONOMANCY_KEY]) doc[RESERVED_ONOMANCY_KEY] = {};
    const map = doc[RESERVED_ONOMANCY_KEY];
    if (!map) return;
    // A list, so not a reference: absent from name matching by value shape
    // (E8), never by its key. See the note in `edgesOf`.
    (map as Record<string, unknown>)[CERTIFICATES_KEY] = [spec.certificate];
    for (const [path, target] of Object.entries(spec.edges)) {
      map[path] = target as AutomergeUrl;
    }
  });

  const written = handle.doc()?.[RESERVED_ONOMANCY_KEY] ?? {};
  const edges = Object.keys(written).filter((key) => key !== CERTIFICATES_KEY);
  if (edges.length !== Object.keys(spec.edges).length) {
    // The silent-write failure has a symptom now rather than a shrug.
    log.warn(
      `namestore ${url}: expected ${Object.keys(spec.edges).length} edge(s), ` +
        `wrote ${edges.length} — the change may not have applied`
    );
  }
  log.info(
    `namestore ${url}: ${spec.certificate.length}-byte certificate, edges [${edges}]`
  );
  return { document: url, certificateBytes: spec.certificate.length, edges };
}

/** The document's bytes, for carrying elsewhere. */
export async function exportBoundNamestore(
  repo: Repo,
  document: AutomergeUrl | string
): Promise<Uint8Array> {
  const bytes = await repo.export(String(document) as AutomergeUrl);
  if (!bytes) throw new Error(`Nothing to export for ${document}`);
  return bytes;
}

/**
 * Save the document to a file, named by its anchor.
 *
 * The anchor-as-filename convention is onomancy's dev bridge: a file named for
 * the document it contains is self-describing, and the id is the verifying key
 * the TXT record names, so the name cannot drift from the contents.
 */
export async function downloadBoundNamestore(
  repo: Repo,
  document: AutomergeUrl | string
): Promise<number> {
  const bytes = await exportBoundNamestore(repo, document);
  const anchor = String(document).replace("automerge:", "");
  // Copied into a fresh buffer: Blob rejects a view over SharedArrayBuffer,
  // which the Uint8Array type admits even though this one never is.
  const blob = new Blob([new Uint8Array(bytes).slice().buffer], {
    type: "application/octet-stream",
  });
  const href = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = href;
  link.download = `${anchor}.automerge`;
  link.click();
  URL.revokeObjectURL(href);
  return bytes.length;
}

/** Load a namestore someone handed you, at the anchor it belongs to. */
export async function importBoundNamestore(
  repo: Repo,
  document: AutomergeUrl | string,
  bytes: Uint8Array
): Promise<BuildResult> {
  const url = String(document) as AutomergeUrl;
  repo.import(bytes, { docId: interpretAsDocumentId(url) });
  const handle = await repo.find<NamestoreDoc>(url);
  const map = handle.doc()?.[RESERVED_ONOMANCY_KEY] ?? {};
  const held = (map as Record<string, unknown>)[CERTIFICATES_KEY];
  return {
    document: url,
    certificateBytes: Array.isArray(held) ? (held[0]?.length ?? 0) : 0,
    edges: Object.keys(map).filter((key) => key !== CERTIFICATES_KEY),
  };
}
