import ReactDOM from "react-dom/client";
import "./index.css";
import {
  initializeAutomergeRepoKeyhive,
  initKeyhiveWasm,
  MODULE_INSTANCE_ID,
  isWasmInitialized,
  setPanicHook,
  AutomergeRepoKeyhive,
} from "@automerge/automerge-repo-keyhive";
import { Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import Frame from "./components/Frame.tsx";

declare global {
  interface Window {
    hive: AutomergeRepoKeyhive;
  }
}

async function startStandalone() {
  console.log("[Demo] Initializing standalone mode");

  initKeyhiveWasm();
  // setPanicHook();

  const storage = new IndexedDBStorageAdapter();
  const networkAdapter = new BrowserWebSocketClientAdapter(
    "wss://keyhive.sync.automerge.org"
    // "ws://localhost:3089"
  );
  const peerIdSuffix = `keyhive-demo-${Math.random().toString(36).slice(2)}`;

  const automergeRepoKeyhive = await initializeAutomergeRepoKeyhive({
    storage,
    peerIdSuffix,
    networkAdapter,
    automaticArchiveIngestion: true,
    onlyShareWithHardcodedServerPeerId: true,
    cacheHashes: true,
  });

  const repo = new Repo({
    storage,
    network: [automergeRepoKeyhive.networkAdapter],
    peerId: automergeRepoKeyhive.peerId,
    sharePolicy: async (peerId) => {
      return peerId === automergeRepoKeyhive.syncServer?.peerId;
    },
    idFactory: automergeRepoKeyhive.idFactory,
  });

  automergeRepoKeyhive.linkRepo(repo);

  window.hive = automergeRepoKeyhive;

  console.log("[Demo] Standalone initialized, mounting app");

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(<Frame automergeRepoKeyhive={automergeRepoKeyhive} repo={repo} />);
}

startStandalone().catch((error) => {
  console.error("[Demo] Failed to start standalone mode:", error);
});

console.log(
  `[Demo] Standalone sees module instance: ${MODULE_INSTANCE_ID}, WASM initialized: ${isWasmInitialized()}`
);
