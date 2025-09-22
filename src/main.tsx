import React, { Suspense } from "react";
import { STATE_PREFIX } from "./constants";
import ReactDOM from "react-dom/client";
import App from "./components/App.tsx";
import "./index.css";
import {
  AutomergeUrl,
  WebSocketClientAdapter,
  Repo,
  IndexedDBStorageAdapter,
  RepoContext,
  DocHandle,
} from "@automerge/react"
import { getOrCreateRoot, RootDocument } from "./rootDoc.ts";
import { KeyhiveNetworkAdapter } from "@automerge/automerge-keyhive-network-adapter";
import { Active, loadOrGenerateActive } from "./user.ts";
import { StateDB } from "./db.ts";
import { IdentitiesDocument } from "./identities.ts";
import { Individual, setPanicHook } from "@keyhive/wasm";

import init, { Keyhive } from '@keyhive/wasm'
import { addServerToIdentitiesDoc, syncServerFromContactCard } from "./server.ts";
import { KeyhiveArchiveBytes, loadOrGenerateKeyhive } from "./keyhive.ts";

// Initialize Keyhive and set panic hook for debugging
await init();
setPanicHook();

const db: StateDB<Active> = new StateDB(`${STATE_PREFIX}-keyhive-demo`)
const active = await loadOrGenerateActive(db)

const keyhiveDB: StateDB<KeyhiveArchiveBytes> = new StateDB(`${STATE_PREFIX}-keyhive-db-11`)
const keyhive = await loadOrGenerateKeyhive(keyhiveDB, active.signer, console.log)

const contactCard = await keyhive.contactCard()
active.contactCard = contactCard.toJson()
const individual: Individual = keyhive.receiveContactCard(contactCard)
active.individual = individual;

// Server contact card is currently just hardcoded for the demo
const serverContactCardJson = "{\"Rotate\":{\"payload\":{\"old\":[73,163,230,244,111,233,153,119,133,211,134,237,111,36,52,131,22,50,54,144,150,45,227,235,128,36,33,217,190,198,55,75],\"new\":[109,115,204,144,178,114,182,238,113,124,4,139,249,76,220,44,128,104,194,68,187,184,82,241,94,145,104,198,159,122,186,43]},\"issuer\":[215,244,30,111,15,78,235,218,7,241,63,222,141,131,33,22,234,116,180,208,97,235,210,55,202,209,170,178,98,37,223,159],\"signature\":[178,64,85,76,51,199,196,151,129,14,191,53,127,191,34,223,97,238,95,109,118,179,152,17,205,188,204,177,116,166,147,231,192,201,48,137,19,214,180,45,108,104,34,8,14,63,115,139,215,142,4,179,233,89,150,218,174,168,107,23,8,109,228,6]}}";
const syncServer = await syncServerFromContactCard(serverContactCardJson, keyhive)

const wsClientAdapter = new WebSocketClientAdapter("ws://localhost:3030");
const keyhiveAdapter = new KeyhiveNetworkAdapter(wsClientAdapter, active.signer, syncServer.peerId);

const repo = new Repo({
  network: [keyhiveAdapter],
  storage: new IndexedDBStorageAdapter(),
  peerId: active.user.peerId,
});

declare global {
  interface Window {
    repo: Repo;
    handle: DocHandle<RootDocument>;
    identities: DocHandle<IdentitiesDocument>;
  }
}
window.repo = repo;

const rootDocUrl = getOrCreateRoot(repo);
window.handle = await repo.find(rootDocUrl);

// FIXME: Hard-coding the identities Automerge URL for now
// const identitiesDocUrl = await getOrCreateIdentities(repo, serverContactCardJson)
// console.log("id doc url: " + identitiesDocUrl)
const identitiesDocUrl = "automerge:3qkZAMeLiHScZGBc2XSMdaNj2wh7" as AutomergeUrl;
window.identities = await repo.find(identitiesDocUrl);

window.identities.change((doc: IdentitiesDocument) => {
  addServerToIdentitiesDoc(syncServer, doc)
});

const storeKeyhive = async (kh: Keyhive, shouldSync: boolean = true) => {
  const archive = kh.toArchive().toBytes();
  keyhiveDB.store(archive);

  if (shouldSync) {
    try {
      const response = await fetch(`http://localhost:3030/access/${active.user.peerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: archive as BodyInit
      });

      if (!response.ok) {
        console.error(`Failed to send archive to server: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending archive to server:', error);
    }
  }
};

const appData = {
  individual: individual,
  active: active,
  keyhive: keyhive,
  db: db,
  syncServer: syncServer,
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div>Loading a document...</div>}>
      <RepoContext.Provider value={repo}>
        <App docUrl={window.handle.url} identitiesUrl={window.identities.url} appData={appData} storeKeyhiveFn={storeKeyhive} />
      </RepoContext.Provider>
    </Suspense>
  </React.StrictMode>,
);
