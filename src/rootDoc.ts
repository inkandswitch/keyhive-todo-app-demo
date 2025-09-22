import { AutomergeUrl, Repo } from "@automerge/react";
import { STATE_PREFIX } from "./constants";

const ROOT_DOC_URL_KEY = `${STATE_PREFIX}-root-doc-url-52`;

export type RootDocument = {
  taskLists: AutomergeUrl[];
};

export const setRootDocUrl = (url: AutomergeUrl): void => {
  localStorage.setItem(ROOT_DOC_URL_KEY, url);
};

export const getOrCreateRoot = (repo: Repo): AutomergeUrl => {
  // Check if we already have a root document
  const existingId = localStorage.getItem(ROOT_DOC_URL_KEY);
  if (existingId) {
    return existingId as AutomergeUrl;
  }

  // Otherwise create one and (synchronously) store it
  const root = repo.create<RootDocument>({ taskLists: [] });
  localStorage.setItem(ROOT_DOC_URL_KEY, root.url);
  return root.url;
};
