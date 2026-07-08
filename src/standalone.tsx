import ReactDOM from "react-dom/client";
import "./index.css";
// The Repo's subduction subsystem uses the slim subduction entry, which does
// not self-initialize its WASM. Importing the full entry initializes the
// shared module instance.
import "@automerge/automerge-subduction";
import {
  initializeAutomergeRepoKeyhiveRustWithRepo,
  initKeyhiveWasm,
  AutomergeRepoKeyhiveRust,
} from "@automerge/automerge-repo-keyhive";
import { Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import Frame from "./components/Frame.tsx";

declare global {
  interface Window {
    hive: AutomergeRepoKeyhiveRust;
  }
  const __SYNC_SERVER__: string;
}

async function startStandalone() {
  console.log("[Demo] Initializing standalone mode");

  initKeyhiveWasm();

  const storage = new IndexedDBStorageAdapter();
  const peerIdSuffix = `keyhive-demo-${Math.random().toString(36).slice(2)}`;

  // Sync through subduction. The "keyhive" identity is the canonical sync
  // server key, shared by keyhive.sync.automerge.org and by the local
  // subduction_cli dev server (which runs the same key). This mirrors the
  // TPW worker configuration.
  const { hive, repo } = await initializeAutomergeRepoKeyhiveRustWithRepo({
    createRepo: (config) => new Repo(config),
    storage,
    peerIdSuffix,
    automaticArchiveIngestion: true,
    cachingMode: "periodic",
    syncServer: "keyhive",
    repo: {
      storage,
      subductionWebsocketEndpoints: [__SYNC_SERVER__],
      enableRemoteHeadsGossiping: true,
    },
  });

  window.hive = hive;

  console.log("[Demo] Standalone initialized, mounting app");

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(<Frame automergeRepoKeyhive={hive} repo={repo} />);
}

startStandalone().catch((error) => {
  console.error("[Demo] Failed to start standalone mode:", error);
});
