import React, { Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App.tsx";
import "./index.css";
import {
  AutomergeUrl,
  Repo,
  RepoContext,
  DocHandle,
} from "@automerge/react"
import { getOrCreateRoot, RootDocument } from "./rootDoc.ts";
import { Keyhive } from "@keyhive/keyhive";
import { Identity } from "@automerge/rootstock"

export const plugins = [
  {
    type: "patchwork:tool",
    id: "keyhive-todo-demo",
    name: "Keyhive TODO Demo",
    supportedDataTypes: ["identity"],
    async load() {
      return {
        render({
          element,
          handle,
          repo,
          identity,
        }: {
          element: HTMLElement;
          handle: DocHandle<{ documents: AutomergeUrl[] }>;
          repo: Repo;
          identity: Identity;
        }) {
          console.log("Entry point")
          useEffect(() => {
            (async () => {
              await init(element, handle, repo, identity)
            })()
          }, [])
        },
      };
    },
  },
];

async function init(
  element: HTMLElement,
  handle: DocHandle<{ documents: AutomergeUrl[] }>,
  repo: Repo,
  identity: Identity,
): Promise<void> {
  console.log("HI")
  const rootDocUrl = getOrCreateRoot(repo);
  const rootDocHandle = await repo.find(rootDocUrl);

  const storeKeyhive = async (kh: Keyhive, shouldSync: boolean = true) => {
    identity.keyhiveDB.store(kh.toArchive().toBytes());
    if (shouldSync) {
      identity.keyhiveAdapter.syncKeyhive(kh)
    }
  };

  const appData = {
    individual: identity.active.individual,
    active: identity.active,
    keyhive: identity.keyhive,
    keyhiveNetworkAdapter: identity.keyhiveAdapter,
    db: identity.activeDB,
    syncServer: identity.syncServer,
  }

  ReactDOM.createRoot(element).render(
    <React.StrictMode>
      <Suspense fallback={<div>Loading a document...</div>}>
        <RepoContext.Provider value={repo}>
          <App docUrl={rootDocHandle.url} identitiesUrl={identity.identitiesDocUrl} appData={appData} storeKeyhiveFn={storeKeyhive} />
        </RepoContext.Provider>
      </Suspense>
    </React.StrictMode>,
  );
}
