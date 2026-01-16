import {
  DocumentId as KeyhiveDocumentId,
  uint8ArrayToHex,
  AutomergeRepoKeyhive,
} from "@automerge/automerge-repo-keyhive";

// Store access as strings instead of WASM objects
export type DocAccessList = Record<string, string>;

export async function accessListForDoc(
  hive: AutomergeRepoKeyhive,
  targetDocId: KeyhiveDocumentId,
): Promise<DocAccessList> {
  const accessList: DocAccessList = {};
  const members = await hive.docMemberCapabilities(targetDocId);
  members.forEach((capability) => {
    const hexId = uint8ArrayToHex(capability.who.id.toBytes());
    // Convert WASM Access object to string immediately
    accessList[hexId] = capability.can.toString();
  });
  return accessList;
}
