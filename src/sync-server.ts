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

// export async function syncServerFromContactCard(
//   contactCardJson: string,
//   serverPeerId: PeerId,
//   keyhive: Keyhive,
// ): Promise<SyncServer> {
//   const serverContactCard = ContactCard.fromJson(contactCardJson);
//   const serverIndividual: Individual =
//     keyhive.receiveContactCard(serverContactCard);

//   const avatarFile = await fetch(new URL("./assets/HAL-9000.webp", import.meta.url).href);
//   const arrayBuffer = await avatarFile.arrayBuffer();
//   const avatar = new Uint8Array(arrayBuffer);
//   return {
//     individual: serverIndividual,
//     contactCard: contactCardJson,
//     peerId: serverPeerId,
//     avatar: avatar,
//   };
// }

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
