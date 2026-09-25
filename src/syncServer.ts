import {
  ContactCard,
  KEYHIVE_SYNC_SERVER_CONTACT_CARD_JSON,
  KEYHIVE_SYNC_SERVER_PEER_ID,
  uint8ArrayToHex,
  type SyncServerSelection,
} from "@automerge/automerge-repo-keyhive";
import { PeerId } from "@automerge/automerge-repo/slim";

// Everything the demo knows about its sync server, resolved once so the whole
// app agrees on which server it is talking to.
//
// A sync server needs at least `relay` access to a document to move its
// ciphertext around, so ARK registers this identity as a relay at startup
// (see main.tsx) and each new document grants it relay access (see
// DocumentList.tsx). The identity has to match the server ENDPOINT actually
// points at: ARK cannot detect a mismatch, and the symptom is silence — relay
// grants and keyhive sync target a peer that never connects.

// Websocket endpoint. Override with SYNC_SERVER, e.g.
// SYNC_SERVER=ws://localhost:3030 for a local subduction_cli dev server.
export const ENDPOINT: string = __SYNC_SERVER__;

// When a custom contact card and peer id are supplied (via the
// SYNC_SERVER_CONTACT_CARD and SYNC_SERVER_PEER_ID build vars) the demo
// targets that server. Otherwise it uses ARK's built-in "keyhive" identity,
// which the public keyhive sync server and a stock local subduction_cli dev
// server both run.
const isCustom = Boolean(
  __SYNC_SERVER_CONTACT_CARD__ && __SYNC_SERVER_PEER_ID__
);

// Passed to initializeAutomergeRepoKeyhive. ARK accepts either the name of an
// identity it ships with or an explicit card/peer id pair.
export const SELECTION: SyncServerSelection = isCustom
  ? {
      contactCardJson: __SYNC_SERVER_CONTACT_CARD__,
      peerId: __SYNC_SERVER_PEER_ID__ as PeerId,
    }
  : "keyhive";

// The same identity, spelled out. The demo needs the card itself to work out
// the server's keyhive id when giving it a phonebook avatar, and resolving it
// here is what keeps that entry pointing at the configured server rather than
// at whichever one happens to be hardcoded.
export const CONTACT_CARD_JSON: string = isCustom
  ? __SYNC_SERVER_CONTACT_CARD__
  : KEYHIVE_SYNC_SERVER_CONTACT_CARD_JSON;

export const PEER_ID: PeerId = (
  isCustom ? __SYNC_SERVER_PEER_ID__ : KEYHIVE_SYNC_SERVER_PEER_ID
) as PeerId;

// The server's hex-encoded keyhive id.
let identifierHexCache: string | undefined;
export function identifierHex(): string | undefined {
  if (identifierHexCache === undefined) {
    const card = ContactCard.fromJson(CONTACT_CARD_JSON);
    if (card) {
      identifierHexCache = uint8ArrayToHex(card.individualId.toBytes());
    }
  }
  return identifierHexCache;
}

// Shown wherever the sync server appears in the UI. ARK tags the sync server's
// own membership entry (DocMember.isSyncServer) so the demo labels it from that
// rather than from the phonebook.
export const DISPLAY_NAME = "Demo Sync Server";
