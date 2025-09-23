import { PeerId } from "@automerge/automerge-repo/slim";
import { ContactCard, Individual, Keyhive } from "@keyhive/keyhive";
import { IdentitiesDocument } from "./identities";
import { uint8ArrayToHex } from "./doc";

export type SyncServer = {
  individual: Individual;
  contactCard: string;
  peerId: PeerId;
  avatar: Uint8Array;
};

export async function syncServerFromContactCard(
  contactCardJson: string,
  keyhive: Keyhive,
): Promise<SyncServer> {
  const serverContactCard = ContactCard.fromJson(contactCardJson);
  const serverPeerId = "1/Qebw9O69oH8T/ejYMhFup0tNBh69I3ytGqsmIl358=" as PeerId;
  const serverIndividual: Individual =
    keyhive.receiveContactCard(serverContactCard);

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

export function addServerToIdentitiesDoc(
  server: SyncServer,
  doc: IdentitiesDocument,
) {
  const serverHexId = uint8ArrayToHex(server.individual.id.toBytes());
  if (!doc.identities[serverHexId]) {
    doc.identities[serverHexId] = {
      peerId: server.peerId,
      name: "Demo Sync Server",
      avatar: server.avatar,
    };
  } else {
    if (!doc.identities[serverHexId].avatar) {
      doc.identities[serverHexId].avatar = server.avatar;
    }
  }
}
