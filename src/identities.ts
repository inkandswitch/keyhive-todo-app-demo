import { AutomergeUrl, Repo } from "@automerge/react";
import { User } from "./user";
import { PeerId } from "@automerge/react";
import { STATE_PREFIX } from "./constants";

const IDENTITIES_DOC_URL_KEY = `${STATE_PREFIX}-identities-doc-url-8`;

// FIXME
// export type Identities = {
//   [contactCardJson: string]: User;
// };

// Maps hexId to User
export type Identities = Record<string, User>;

// Maps Doc URL to doc Identifier
export type DocIds = Record<string, Uint8Array>;

// Maps Doc URL to Group Identifier
export type DocGroups = Record<string, Uint8Array>;

export type IdentitiesDocument = {
  identities: Identities;
  docIds: DocIds;
  docGroups: DocGroups;
};

export const setIdentitiesUrl = (url: AutomergeUrl): void => {
  localStorage.setItem(IDENTITIES_DOC_URL_KEY, url);
};

export async function getOrCreateIdentities(
  repo: Repo,
  hardcodedSyncServerContactCardJson: string,
): Promise<AutomergeUrl> {
  // Check if we already have an identities document
  const existingId = localStorage.getItem(IDENTITIES_DOC_URL_KEY);
  if (existingId) {
    return existingId as AutomergeUrl;
  }

  const initial_identities: Identities = {};
  const avatarFile = await fetch("/HAL-9000.webp");
  const arrayBuffer = await avatarFile.arrayBuffer();
  const avatarData = new Uint8Array(arrayBuffer);
  initial_identities[hardcodedSyncServerContactCardJson] = {
    peerId: "1/Qebw9O69oH8T/ejYMhFup0tNBh69I3ytGqsmIl358=" as PeerId, // Keep peerId for backwards compatibility
    name: "Demo Sync Server",
    avatar: avatarData,
  };

  // Otherwise create one and (synchronously) store it
  const identities = repo.create<IdentitiesDocument>({
    identities: initial_identities,
    docIds: {},
    docGroups: {},
  });
  localStorage.setItem(IDENTITIES_DOC_URL_KEY, identities.url);
  return identities.url;
}
