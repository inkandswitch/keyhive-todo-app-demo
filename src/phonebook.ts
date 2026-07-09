import { AutomergeUrl, DocumentId, PeerId, Repo } from "@automerge/react";

export type Contact = {
  peerId: PeerId;
  name?: string;
  avatar: Uint8Array | null;
};

// Maps hexId to Contact
export type Phonebook = Record<string, Contact>;

// The phonebook is a single well-known document that every peer reads and
// writes, so names and avatars are visible to everyone. It is an ordinary
// (unencrypted) document, which is fine for a demo but not private.
export const PHONEBOOK_URL =
  "automerge:4LC8WQxBbLH92x9crDq5HwhUYopU" as AutomergeUrl;
const PHONEBOOK_DOC_ID = "4LC8WQxBbLH92x9crDq5HwhUYopU" as DocumentId;

// A deterministic Automerge document that materializes to an empty map `{}`.
// (Its single change adds and removes a key, so the doc has heads and imports
// as a ready document while carrying no state.) When the phonebook is not
// available (for example against a freshly started sync server that has never
// seen it), any peer seeds it under the well-known id by importing these exact
// bytes. Every peer imports the same bytes into the same id, so their copies
// share a root; peers then only ever write their own hex-id entry, so the
// per-peer writes merge cleanly.
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
