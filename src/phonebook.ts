// This is demo-only code to enable name and avatar rendering in the TODO app.
//
// The phonebook is a legacy, unencrypted document that is not access-controlled
// by keyhive. Every peer reads and writes to it, and only "security by obscurity"
// is protecting it. If you have its id, you have access.
//
// It reaches the UI as a NameDirectory, which is the only thing the components
// know about. Replacing it with a real name registry means writing another
// NameDirectory and handing that to DirectoryProvider in App.tsx.

import {
  AutomergeUrl,
  Repo,
  interpretAsDocumentId,
  isValidAutomergeUrl,
} from "@automerge/react";
import type { DirectoryDoc } from "@automerge/keyhive-react";

// Maps hex-encoded keyhive id to that peer's name and avatar.
export type Phonebook = DirectoryDoc;

export const PHONEBOOK_NOTICE =
  "Display names and avatars come from the demo phonebook: an unencrypted " +
  "document that anyone holding its id can edit, so they are self-asserted " +
  "and forgeable. DNS name claims are stored here too but are not taken on " +
  "the phonebook's word — their badge comes from DNSSEC and the named " +
  "document's own certificate, so a forged claim cannot earn one.";

// The notice above is about display names, and stays true. DNS name claims
// stored alongside them are a different case worth being precise about.
//
// A claim in the phonebook is forgeable, exactly like a display name: anyone
// holding the id can write `dnsName: "example.com"` into anyone's entry. What
// they cannot forge is the *badge*, because it is not read from this document.
// A verifying directory resolves the domain's DNSSEC-signed `_onomancy` record
// and checks whether it designates that identity, so a forged claim renders as
// `mismatch` or `no-claim` and never as `verified`.
//
// That is the property that lets an untrusted document hold claims safely: the
// document carries the assertion, and DNS carries the authority.

// The phonebook is a single document that every peer reads and writes, so names
// and avatars are visible to everyone who has its id. Its id comes from the
// required PHONEBOOK_DOC_ID build variable rather than being hardcoded, so each
// deployment gets a phonebook shared only with the people it shares the id with.
export const PHONEBOOK_URL: AutomergeUrl = (() => {
  const url = __PHONEBOOK_DOC_ID__.startsWith("automerge:")
    ? __PHONEBOOK_DOC_ID__
    : `automerge:${__PHONEBOOK_DOC_ID__}`;
  if (!isValidAutomergeUrl(url)) {
    throw new Error(
      `PHONEBOOK_DOC_ID is not a valid Automerge document id: "${__PHONEBOOK_DOC_ID__}". ` +
        "Generate one with `pnpm gen:phonebook-id`."
    );
  }
  return url;
})();

const PHONEBOOK_DOC_ID = interpretAsDocumentId(PHONEBOOK_URL);

// A deterministic Automerge document that materializes to an empty map `{}`.
// When the phonebook is not available (for example against a freshly started
// sync server that has never seen it), any peer seeds it under the configured
// id by importing these exact bytes. Every peer imports the same bytes into
// the same id, so their copies share a root. Peers then only ever write their
// own hex-id entry, so the per-peer writes merge cleanly.
const CANONICAL_PHONEBOOK_BASE64 =
  "hW9Kgy+PHqIAcgEEAAAAAAEe1Lktwc6gvC/3MqqGTwH/up5olcGuWqIiF/a/aRxohwYBAgMCEwIjBkACVgIJFQghAiMCNAFCAlYCgAECgQECgwECfwB/AX8Cf+CxutIGfwB/B38GX19zZWVkfwB/AQF/AX8CfwF/AH8CAA==";

function canonicalPhonebookBytes(): Uint8Array {
  const binary = atob(CANONICAL_PHONEBOOK_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Make sure the shared phonebook exists. If it cannot be loaded (not in local
// storage and not served by the sync server), seed the well-known doc.
export async function ensurePhonebook(repo: Repo): Promise<void> {
  try {
    await repo.find(PHONEBOOK_URL);
  } catch {
    repo.import(canonicalPhonebookBytes(), { docId: PHONEBOOK_DOC_ID });
  }
}
