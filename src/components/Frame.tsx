import {
  AutomergeUrl,
  DocHandle,
  Repo,
  RepoContext,
  useDocument,
} from "@automerge/react/slim";
import { KeyhiveKit } from "@automerge/rootstock-identity";
import App from "./App";
import { Suspense } from "react";

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
  const [account, _changeAccount] = useDocument<TemporaryAccountInterface>(
    props.accountUrl,
    { suspense: true },
  );

  return (
    <Suspense>
      <App
        docUrl={account?.rootFolderUrl}
        keyhiveKit={props.keyhiveKit}
        storeKeyhiveFn={props.keyhiveKit.storeKeyhive}
      />
    </Suspense>
  );
}
