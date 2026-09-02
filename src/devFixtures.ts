// Seeding the onomancy test binding into a local browser.
//
// The document `onotest.brooklynzelenka.com` designates cannot replicate: its
// id is a self-certifying ed25519 key, which ARK classifies as keyhive-
// protected by shape, but it was minted by `onomancer` rather than by keyhive.
// So no keyhive state exists for it, no relay grant is possible, and no
// replica ever arrives from the sync server. ADR-023 has the full closure.
//
// Testing the certificate path therefore means seeding it locally rather than
// receiving it. Exposed on `window` beside the other debug handles rather than
// wired into the UI: it is a fixture for exercising a path, not a feature, and
// putting it behind a button would imply the demo can adopt arbitrary bound
// documents. It cannot — that is the whole finding.

import {
  interpretAsDocumentId,
  isValidAutomergeUrl,
  type AutomergeUrl,
  type Repo,
} from "@automerge/react/slim";
import { RESERVED_ONOMANCY_KEY, CERTIFICATES_KEY } from "./namestore";
import type { NamestoreDoc } from "./namestore";
import { log } from "./log";

/** The document the published TXT record designates. */
export const ONOTEST_DOC =
  "automerge:2nuSYdXmDNwcZG61XBXVQqjs5z1ExPDYZTsYVm9toa5Qh5iu5V" as AutomergeUrl;

export const ONOTEST_HOSTNAME = "onotest.brooklynzelenka.com";

const CERTIFICATE_URL = "/fixtures/onotest.brooklynzelenka.com.chained.onc";

/**
 * A deterministic Automerge document that materializes to an empty map.
 *
 * The same bytes `phonebook.ts` uses to seed a well-known id. Importing them
 * under a chosen id is what puts a document at that id without keyhive having
 * generated it.
 */
const EMPTY_DOC_BASE64 =
  "hW9Kgy+PHqIAcgEEAAAAAAEe1Lktwc6gvC/3MqqGTwH/up5olcGuWqIiF/a/aRxohwYBAgMCEwIjBkACVgIJFQghAiMCNAFCAlYCgAECgQECgwECfwB/AX8Cf+CxutIGfwB/B38GX19zZWVkfwB/AQF/AX8CfwF/AH8CAA==";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface SeedResult {
  document: string;
  certificateBytes: number;
  edges: string[];
}

/**
 * Seed the bound document, its certificate, and one name to walk to.
 *
 * `target` is what `todos/test` will resolve to — any document this browser can
 * already open. Defaults to whatever the caller passes; there is no sensible
 * default, since the point is to land somewhere you can see.
 *
 * Idempotent: importing over an existing document is a no-op for content that
 * already matches, and the writes are last-writer-wins on two fixed keys.
 */
export async function seedOnotest(
  repo: Repo,
  target: AutomergeUrl | string
): Promise<SeedResult> {
  if (!isValidAutomergeUrl(target)) {
    throw new Error(`Not a valid Automerge url to name: ${target}`);
  }

  const response = await fetch(CERTIFICATE_URL);
  if (!response.ok) {
    throw new Error(
      `Could not load the certificate fixture (${response.status}). ` +
        `Expected it at ${CERTIFICATE_URL}.`
    );
  }
  const certificate = new Uint8Array(await response.arrayBuffer());

  // Importing under a chosen id is what places a document at an id keyhive
  // never generated — the same mechanism `ensurePhonebook` uses.
  repo.import(base64ToBytes(EMPTY_DOC_BASE64), {
    docId: interpretAsDocumentId(ONOTEST_DOC),
  });

  const handle = await repo.find<NamestoreDoc>(ONOTEST_DOC);
  handle.change((doc) => {
    // Assign then re-read — see the note in `bindEdge`. `??=` returns the
    // plain object, not the proxy, and this document is *imported* rather than
    // created, so the reserved key is genuinely absent the first time.
    if (!doc[RESERVED_ONOMANCY_KEY]) doc[RESERVED_ONOMANCY_KEY] = {};
    const map = doc[RESERVED_ONOMANCY_KEY];
    if (!map) return;
    // The certificate is a list, so it is not a reference and the walk skips
    // it by value shape (E8). Nothing about its key name matters.
    (map as Record<string, unknown>)[CERTIFICATES_KEY] = [certificate];
    map["todos/test"] = target as AutomergeUrl;
  });

  const seeded = handle.doc()?.[RESERVED_ONOMANCY_KEY] ?? {};
  const result: SeedResult = {
    document: ONOTEST_DOC,
    certificateBytes: certificate.length,
    edges: Object.keys(seeded).filter((key) => key !== CERTIFICATES_KEY),
  };
  log.info(
    `seeded ${ONOTEST_DOC} with a ${certificate.length}-byte certificate; ` +
      `try #@${ONOTEST_HOSTNAME}/todos/test`
  );
  return result;
}
