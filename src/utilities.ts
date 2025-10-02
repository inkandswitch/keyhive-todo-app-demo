import { uint8ArrayToHex } from "@automerge/rootstock-identity";
import {
  DocumentId as KeyhiveDocumentId,
  Keyhive,
} from "@keyhive/keyhive";

// Store access as strings instead of WASM objects
export type DocAccessList = Record<string, string>;

export function accessListForDoc(
  keyhive: Keyhive,
  targetDocId: KeyhiveDocumentId,
): DocAccessList {
  const accessList: DocAccessList = {};
  console.log("BEFORE docMemberCapabilities");
  const members = keyhive.docMemberCapabilities(targetDocId);
  console.log("AFTER docMemberCapabilities");
  members.forEach((capability) => {
    const hexId = uint8ArrayToHex(capability.who.id.toBytes());
    // Convert WASM Access object to string immediately
    accessList[hexId] = capability.can.toString();
  });
  return accessList;
}
