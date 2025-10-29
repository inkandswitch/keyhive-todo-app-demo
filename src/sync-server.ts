import { PeerId } from "@automerge/automerge-repo/slim";
import { Individual } from "@keyhive/keyhive/slim";
import { Phonebook } from "./phonebook";
import { uint8ArrayToHex } from "@automerge/automerge-repo-keyhive";

export type SyncServer = {
  individual: Individual;
  contactCard: string;
  peerId: PeerId;
  avatar: Uint8Array;
};

export function addServerToPhonebook(server: SyncServer, doc: Phonebook) {
  const serverHexId = uint8ArrayToHex(server.individual.id.toBytes());
  if (!doc[serverHexId]) {
    doc[serverHexId] = {
      peerId: server.peerId,
      name: "Demo Sync Server",
      avatar: server.avatar,
    };
  } else {
    if (!doc[serverHexId].avatar) {
      doc[serverHexId].avatar = server.avatar;
    }
  }
}
