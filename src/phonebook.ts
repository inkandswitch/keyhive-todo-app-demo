import { AutomergeUrl, PeerId, Repo } from "@automerge/react";

const PHONEBOOK_URL_KEY = `phonebook-url-8`;

export type Contact = {
  peerId: PeerId;
  name?: string;
  avatar: Uint8Array | null;
};

// Maps hexId to Contact
export type Phonebook = Record<string, Contact>;

// Maps Doc URL to doc Identifier
export type DocIds = Record<string, Uint8Array>;

// Maps Doc URL to Group Identifier
export type DocGroups = Record<string, Uint8Array>;

export const setPhonebookUrl = (url: AutomergeUrl): void => {
  localStorage.setItem(PHONEBOOK_URL_KEY, url);
};

export async function getOrCreatePhonebook(
  repo: Repo,
  hardcodedSyncServerContactCardJson: string,
): Promise<AutomergeUrl> {
  // Check if we already have a phonebook
  const existingId = localStorage.getItem(PHONEBOOK_URL_KEY);
  if (existingId) {
    return existingId as AutomergeUrl;
  }

  const contacts: Record<string, Contact> = {};
  const avatarData = await getServerAvatar();
  contacts[hardcodedSyncServerContactCardJson] = {
    peerId: "1/Qebw9O69oH8T/ejYMhFup0tNBh69I3ytGqsmIl358=" as PeerId,
    name: "Demo Sync Server",
    avatar: avatarData,
  };

  // Otherwise create one and (synchronously) store it
  console.log("[Demo] Creating phonebook");
  const phonebook = await repo.create2<Phonebook>(contacts);
  setPhonebookUrl(phonebook.url);
  console.log("[Demo] Created and set phonebook");
  return phonebook.url;
}

// export async function findPhonebook({
//   repo,
//   syncServer,
// }: {
//   repo: Repo;
//   syncServer: SyncServer;
// }) {
//   // FIXME: Hard-coding the phonebook Automerge URL for now
//   // const phonebookDocUrl = await getOrCreatePhonebook(repo, serverContactCardJson)
//   // console.log("id doc url: " + phonebookDocUrl)
//   const phonebookUrl = "automerge:4LC8WQxBbLH92x9crDq5HwhUYopU" as AutomergeUrl;
//   const phonebookDoc: DocHandle<Phonebook> = await repo.find(phonebookUrl);
//   phonebookDoc.change(
//     async (doc: Phonebook) => await addServerToPhonebook(syncServer, doc),
//   );
//   return phonebookDoc;
// }

// export async function addServerToPhonebook(server: SyncServer, doc: Phonebook) {
//   const serverHexId = uint8ArrayToHex(server.individual.id.toBytes());
//   const avatar = await getServerAvatar();
//   if (!doc[serverHexId]) {
//     doc[serverHexId] = {
//       peerId: server.peerId,
//       name: "Demo Sync Server",
//       avatar: avatar,
//     };
//   } else {
//     if (!doc[serverHexId].avatar) {
//       doc[serverHexId].avatar = avatar;
//     }
//   }
// }

async function getServerAvatar(): Promise<Uint8Array> {
  const avatarFile = await fetch(
    new URL("./assets/HAL-9000.webp", import.meta.url).href,
  );
  const arrayBuffer = await avatarFile.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
