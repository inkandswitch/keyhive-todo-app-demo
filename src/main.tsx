import ReactDOM from "react-dom/client";
import "./index.css";
// The Repo's subduction subsystem uses the slim subduction entry, which does
// not self-initialize its WASM. Importing the full entry initializes the
// shared module instance.
import "@automerge/automerge-subduction";
import {
  initializeAutomergeRepoKeyhiveSubduction,
  AutomergeRepoKeyhiveSubduction,
  type SyncServerSelection,
} from "@automerge/automerge-repo-keyhive";
import { Repo } from "@automerge/automerge-repo";
import { PeerId } from "@automerge/automerge-repo/slim";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import Frame from "./components/Frame.tsx";

declare global {
  interface Window {
    hive: AutomergeRepoKeyhiveSubduction;
  }
  const __SYNC_SERVER__: string;
  const __SYNC_SERVER_CONTACT_CARD__: string;
  const __SYNC_SERVER_PEER_ID__: string;
}

// The identity to register as the sync server relay. When a custom contact
// card and peer id are supplied (via the SYNC_SERVER_CONTACT_CARD and
// SYNC_SERVER_PEER_ID build vars) the demo targets that server. Otherwise it
// uses the built-in "keyhive" identity, which the public keyhive sync server
// and a stock local subduction_cli dev server both run. The identity must
// match whatever server __SYNC_SERVER__ points at.
const syncServer: SyncServerSelection =
  __SYNC_SERVER_CONTACT_CARD__ && __SYNC_SERVER_PEER_ID__
    ? {
        contactCardJson: __SYNC_SERVER_CONTACT_CARD__,
        peerId: __SYNC_SERVER_PEER_ID__ as PeerId,
      }
    : "keyhive";

async function start() {
  const storage = new IndexedDBStorageAdapter();

  const { hive, repo } = await initializeAutomergeRepoKeyhiveSubduction({
    createRepo: (config) => new Repo(config),
    storage,
    // ARK appends a random component for peer uniqueness, so a plain label is
    // all the demo needs to pass.
    peerIdSuffix: "keyhive-demo",
    automaticArchiveIngestion: true,
    cachingMode: "periodic",
    syncServer,
    repo: {
      storage,
      subductionWebsocketEndpoints: [__SYNC_SERVER__],
      enableRemoteHeadsGossiping: true,
    },
  });

  window.hive = hive;

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(<Frame automergeRepoKeyhive={hive} repo={repo} />);
}

start().catch((error) => {
  console.error("[Demo] Failed to start:", error);
});
