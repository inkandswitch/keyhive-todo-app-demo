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
  AutomergeRepoKeyhiveSubduction,
  uint8ArrayToHex,
} from "@automerge/automerge-repo-keyhive";

export interface TemporaryAccountInterface {
  rootFolderUrl: AutomergeUrl;
}

export default function Frame({
  automergeRepoKeyhive,
  repo,
}: {
  automergeRepoKeyhive: AutomergeRepoKeyhiveSubduction;
  repo: Repo;
}) {
  return (
    <RepoContext.Provider value={repo}>
      <FrameInner automergeRepoKeyhive={automergeRepoKeyhive} />
    </RepoContext.Provider>
  );
}

function FrameInner(props: { automergeRepoKeyhive: AutomergeRepoKeyhiveSubduction }) {
  const repo = useRepo();
  const [rootDocUrl, setRootDocUrl] = useState<AutomergeUrl | null>(null);

  useEffect(() => {
    const identityId = uint8ArrayToHex(
      props.automergeRepoKeyhive.active.individual.id.toBytes(),
    );
    const storageKey = `keyhive-demo-root-${identityId}`;
    const existingUrl = localStorage.getItem(storageKey);
    if (existingUrl) {
      setRootDocUrl(existingUrl as AutomergeUrl);
    } else {
      // repo.create (not create2) makes a plain legacy document. The root doc
      // is a local, per-identity index that is never shared, so it does not
      // need keyhive access control. Shared task lists use repo.create2 (see
      // DocumentList) to become access-controlled keyhive documents.
      const handle = repo.create<RootDocument>({ taskLists: [] });
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
