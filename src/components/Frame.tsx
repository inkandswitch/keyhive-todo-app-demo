import {
  AutomergeUrl,
  Repo,
  RepoContext,
  useRepo,
} from "@automerge/react/slim";
import App from "./App";
import { Suspense, useEffect, useState } from "react";
import { RootDocument } from "../rootDoc";
import {
  AutomergeRepoKeyhiveRust,
  uint8ArrayToHex,
} from "@automerge/automerge-repo-keyhive";

export interface TemporaryAccountInterface {
  rootFolderUrl: AutomergeUrl;
}

export default function Frame({
  automergeRepoKeyhive,
  repo,
}: {
  automergeRepoKeyhive: AutomergeRepoKeyhiveRust;
  repo: Repo;
}) {
  return (
    <RepoContext.Provider value={repo}>
      <FrameInner automergeRepoKeyhive={automergeRepoKeyhive} />
    </RepoContext.Provider>
  );
}

function FrameInner(props: { automergeRepoKeyhive: AutomergeRepoKeyhiveRust }) {
  const repo = useRepo();
  const [rootDocUrl, setRootDocUrl] = useState<AutomergeUrl | null>(null);

  useEffect(() => {
    const identityId = uint8ArrayToHex(
      props.automergeRepoKeyhive.active.individual.id.toBytes(),
    );
    const storageKey = `keyhive-demo-root-${identityId}`;
    const existingUrl = localStorage.getItem(storageKey);
    if (existingUrl) {
      console.log(
        `[Demo] Found existing root doc for identity ${identityId}: ${existingUrl}`,
      );
      setRootDocUrl(existingUrl as AutomergeUrl);
    } else {
      console.log(`[Demo] Creating new root doc for identity ${identityId}`);
      const handle = repo.create<RootDocument>({ taskLists: [] });
      console.log(`[Demo] Created root document: ${handle.url}`);
      localStorage.setItem(storageKey, handle.url);
      setRootDocUrl(handle.url);
    }
  }, [repo, props.automergeRepoKeyhive.active.individual.id]);

  if (!rootDocUrl) {
    return <div>Initializing...</div>;
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          Loading...
        </div>
      }
    >
      <App
        docUrl={rootDocUrl}
        automergeRepoKeyhive={props.automergeRepoKeyhive}
      />
    </Suspense>
  );
}
