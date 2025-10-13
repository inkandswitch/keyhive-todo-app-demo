import {
  DocumentId as KeyhiveDocumentId,
  Keyhive,
} from "@keyhive/keyhive/slim";
import { uint8ArrayToHex } from "@automerge/automerge-repo-keyhive";

// Store access as strings instead of WASM objects
export type DocAccessList = Record<string, string>;

export async function accessListForDoc(
  keyhive: Keyhive,
  targetDocId: KeyhiveDocumentId,
): Promise<DocAccessList> {
  const accessList: DocAccessList = {};
  const members = await keyhive.docMemberCapabilities(targetDocId);
  members.forEach((capability) => {
    const hexId = uint8ArrayToHex(capability.who.id.toBytes());
    // Convert WASM Access object to string immediately
    accessList[hexId] = capability.can.toString();
  });
  return accessList;
}
