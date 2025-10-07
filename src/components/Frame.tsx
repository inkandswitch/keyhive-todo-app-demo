import {
  AutomergeUrl,
  DocHandle,
  Repo,
  RepoContext,
  useDocument,
  useRepo,
} from "@automerge/react/slim";
import { KeyhiveKit } from "@automerge/rootstock-identity";
import App from "./App";
import { Suspense, useEffect } from "react";
import { RootDocument } from "../rootDoc";

export interface TemporaryAccountInterface {
  rootFolderUrl: AutomergeUrl;
}

export default function Frame({
  accountHandle,
  keyhiveKit,
  repo,
}: {
  accountHandle: DocHandle<TemporaryAccountInterface>;
  keyhiveKit: KeyhiveKit;
  repo: Repo;
}) {
  return (
    <RepoContext.Provider value={repo}>
      <FrameInner accountUrl={accountHandle.url} keyhiveKit={keyhiveKit} />
    </RepoContext.Provider>
  );
}

function FrameInner(props: {
  accountUrl: AutomergeUrl;
  keyhiveKit: KeyhiveKit;
}) {
  const repo = useRepo();
  const [account, changeAccount] = useDocument<TemporaryAccountInterface>(
    props.accountUrl,
    { suspense: true },
  );

  useEffect(() => {
    if (!account?.rootFolderUrl) {
      console.log("No rootFolderUrl found, creating root document");
      const handle = repo.create<RootDocument>({ taskLists: [] });
      console.log("Created root document:", handle.url);
      changeAccount((doc) => {
        doc.rootFolderUrl = handle.url;
      });
    }
  }, [account, changeAccount, repo]);

  if (!account?.rootFolderUrl) {
    return <div>Initializing...</div>;
  }

  return (
    <Suspense>
      <App
        docUrl={account.rootFolderUrl}
        keyhiveKit={props.keyhiveKit}
      />
    </Suspense>
  );
}
