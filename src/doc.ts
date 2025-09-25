import { AutomergeUrl, DocHandle } from "@automerge/react";
import {
  Access,
  ChangeRef,
  DocumentId,
  Identifier,
  Individual,
  Keyhive,
} from "@keyhive/keyhive/slim";
import { AccessString } from "./user";
import { IdentitiesDocument } from "@automerge/rootstock-identity";

export type DocAccessList = Record<string, Access>;

export async function generateDoc<T>(
  kh: Keyhive,
  changeIdentitiesDoc: (updater: (doc: IdentitiesDocument) => void) => void,
  membersToAdd: [Individual, AccessString][],
  docBuilder: () => DocHandle<T>,
  storeKeyhive: (kh: Keyhive) => void,
): Promise<DocHandle<T>> {
  // For now, randomly generate a ChangeRef
  const changeRefArray = Uint8Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 256),
  );
  const changeRef = new ChangeRef(changeRefArray);
  const g = await kh.generateGroup([]);
  const keyhiveDoc = await kh.generateDocument([g.toPeer()], changeRef, []);
  const docHandle = docBuilder();
  await storeKeyhive(kh);

  changeIdentitiesDoc((d: IdentitiesDocument) => {
    d.docIds[docHandle.url as string] = keyhiveDoc.doc_id.toBytes();
    d.docGroups[docHandle.url as string] = g.id.toBytes();
  });

  // Add members after the identities doc is updated with group info
  changeIdentitiesDoc(async (identitiesDoc: IdentitiesDocument) => {
    for (const [individual, cap] of membersToAdd) {
      const access = Access.tryFromString(cap);
      if (!access) {
        console.error("Failed to derive Access");
        continue;
      }
      await addMemberToDoc(
        kh,
        docHandle.url,
        identitiesDoc,
        individual,
        access,
        storeKeyhive,
      );
    }
  });

  return docHandle;
}

export async function addMemberToDoc(
  kh: Keyhive,
  docUrl: AutomergeUrl,
  identitiesDoc: IdentitiesDocument,
  member: Individual,
  access: Access,
  storeKeyhive: (kh: Keyhive) => void,
) {
  const agent = member.toAgent();
  const groupIdBytes = identitiesDoc.docGroups[docUrl];
  if (!groupIdBytes) {
    console.error("GroupId not found in docGroups for url:", docUrl);
    return;
  }
  const groupId = new Identifier(groupIdBytes);
  const group = kh.getGroup(groupId);
  if (!access || !agent) {
    console.error("Failed to add member: invalid access or agent!");
    return;
  }
  if (!group) {
    console.error(`Failed to add member: group not found for id ${groupId}`);
    return;
  }

  await kh.addMember(agent, group.toMembered(), access, []);
  await storeKeyhive(kh);
}

export async function revokeMemberFromDoc(
  kh: Keyhive,
  docUrl: AutomergeUrl,
  identitiesDoc: IdentitiesDocument,
  hexId: string,
  storeKeyhive: (kh: Keyhive) => void,
) {
  const identifier = new Identifier(hexToUint8Array(hexId));
  const agent = kh.getAgent(identifier);

  if (!agent) {
    console.error("Agent to revoke not found");
    return;
  }

  const groupIdBytes = identitiesDoc.docGroups[docUrl];
  if (!groupIdBytes) {
    console.error(
      `Failed to revoke member: groupId not found in docGroups for url: ${docUrl}`,
    );
    return;
  }
  const groupId = new Identifier(groupIdBytes);
  const group = kh.getGroup(groupId);

  if (!group) {
    console.error(`Failed to revoke member: group not found for id ${groupId}`);
    return;
  }

  const membered = group.toMembered();
  await kh.revokeMember(agent, true, membered);
  await storeKeyhive(kh);
}

export function accessListForDoc(keyhive: Keyhive, targetDocId: DocumentId) {
  const accessList: DocAccessList = {};
  const members = keyhive.docMemberCapabilities(targetDocId);
  members.forEach((capability) => {
    const hexId = uint8ArrayToHex(capability.who.id.toBytes());
    accessList[hexId] = capability.can;
  });
  return accessList;
}

export async function hashIdentifier(
  identifier: Identifier,
): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(identifier.toBytes()).buffer,
  );
  return new Uint8Array(hashBuffer);
}

export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
