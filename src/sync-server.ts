import { PeerId } from "@automerge/automerge-repo/slim";
import { ContactCard, Individual, Keyhive } from "@keyhive/keyhive/slim";

export type SyncServer = {
  individual: Individual;
  contactCard: string;
  peerId: PeerId;
  avatar: Uint8Array;
};

export async function syncServerFromContactCard(
  contactCardJson: string,
  serverPeerId: PeerId,
  keyhive: Keyhive,
): Promise<SyncServer> {
  const serverContactCard = ContactCard.fromJson(contactCardJson);
  console.log("BEFORE receiveContactCard");
  const serverIndividual: Individual =
    keyhive.receiveContactCard(serverContactCard);
  console.log("AFTER receiveContactCard");

  const avatarFile = await fetch("/HAL-9000.webp");
  const arrayBuffer = await avatarFile.arrayBuffer();
  const avatar = new Uint8Array(arrayBuffer);
  return {
    individual: serverIndividual,
    contactCard: contactCardJson,
    peerId: serverPeerId,
    avatar: avatar,
  };
}

// export function addServerToPhonebook(server: SyncServer, doc: Phonebook) {
//   const serverHexId = uint8ArrayToHex(server.individual.id.toBytes());
//   if (!doc[serverHexId]) {
//     doc[serverHexId] = {
//       peerId: server.peerId,
//       name: "Demo Sync Server",
//       avatar: server.avatar,
//     };
//   } else {
//     if (!doc[serverHexId].avatar) {
//       doc[serverHexId].avatar = server.avatar;
//     }
//   }
// }
