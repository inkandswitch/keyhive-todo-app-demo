import { AutomergeUrl, Repo } from "@automerge/react/slim";
import { STATE_PREFIX } from "./constants";

const ROOT_DOC_URL_KEY = `${STATE_PREFIX}-root-doc-url-52`;

export type RootDocument = {
  taskLists: AutomergeUrl[];
};

export const setRootDocUrl = (url: AutomergeUrl): void => {
  localStorage.setItem(ROOT_DOC_URL_KEY, url);
};

export const getOrCreateRoot = async (repo: Repo): Promise<AutomergeUrl> => {
  // Check if we already have a root document
  const existingId = localStorage.getItem(ROOT_DOC_URL_KEY);
  if (existingId) {
    return existingId as AutomergeUrl;
  }

  // Otherwise create one and (synchronously) store it
  console.log("Creating root doc")
  const root = await repo.create2<RootDocument>({ taskLists: [] });
  console.log("Created root doc")
  localStorage.setItem(ROOT_DOC_URL_KEY, root.url);
  return root.url;
};
