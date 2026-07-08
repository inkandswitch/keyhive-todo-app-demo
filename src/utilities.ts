import { AutomergeUrl } from "@automerge/react/slim";
import {
  uint8ArrayToHex,
  AutomergeRepoKeyhiveRust,
} from "@automerge/automerge-repo-keyhive";

// Store access as strings instead of WASM objects
export type DocAccessList = Record<string, string>;

export async function accessListForDoc(
  hive: AutomergeRepoKeyhiveRust,
  docUrl: AutomergeUrl,
): Promise<DocAccessList> {
  const accessList: DocAccessList = {};
  const members = await hive.docMemberCapabilities(docUrl);
  members.forEach((capability) => {
    const hexId = uint8ArrayToHex(capability.who.id.toBytes());
    // Convert WASM Access object to string immediately
    accessList[hexId] = capability.can.toString();
  });
  return accessList;
}
