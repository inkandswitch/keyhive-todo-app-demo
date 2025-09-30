import { uint8ArrayToHex } from "@automerge/rootstock-identity";
import {
  DocumentId as KeyhiveDocumentId,
  Keyhive,
  Access,
} from "@keyhive/keyhive";

export type DocAccessList = Record<string, Access>;

export function accessListForDoc(
  keyhive: Keyhive,
  targetDocId: KeyhiveDocumentId,
): DocAccessList {
  const accessList: DocAccessList = {};
  const members = keyhive.docMemberCapabilities(targetDocId);
  members.forEach((capability) => {
    const hexId = uint8ArrayToHex(capability.who.id.toBytes());
    accessList[hexId] = capability.can;
  });
  return accessList;
}
