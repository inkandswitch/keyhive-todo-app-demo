import ReactDOM from "react-dom/client";
import "./index.css";
// Every class in it is prefixed kh-, so it sits alongside this app's Tailwind.
import "@automerge/keyhive-react/styles.css";
// The Repo's subduction subsystem uses the slim subduction entry, which does
// not self-initialize its WASM. Importing the full entry initializes the
// shared module instance.
import { setSubductionLogLevel } from "@automerge/automerge-subduction";
import {
  initializeAutomergeRepoKeyhive,
  AutomergeRepoKeyhive,
  setKeyhiveLogLevel,
  type KeyhiveLogLevel,
} from "@automerge/automerge-repo-keyhive";
// eslint-disable-next-line automerge-slimport/enforce-automerge-slim-import
import { Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import Frame from "./components/Frame.tsx";
import {
  buildBoundNamestore,
  downloadBoundNamestore,
  importBoundNamestore,
} from "./boundNamestore.ts";
import { seedOnotest } from "./devFixtures.ts";
import { initOnomancy } from "./onomancy.ts";
import { ensurePhonebook } from "./phonebook.ts";
import * as syncServer from "./syncServer.ts";
import { log, setDemoLogLevel, type DemoLogLevel } from "./log.ts";

declare global {
  interface Window {
    hive: AutomergeRepoKeyhive;
    repo: Repo;
    setDemoLogLevel: (level: DemoLogLevel) => void;
    setSubductionLogLevel: (level: string) => void;
    setKeyhiveLogLevel: (level: KeyhiveLogLevel) => void;
    seedOnotest: (target: string) => Promise<unknown>;
    namestore: {
      build: (
        spec: Parameters<typeof buildBoundNamestore>[1]
      ) => Promise<unknown>;
      save: (document: string) => Promise<number>;
      load: (document: string, bytes: Uint8Array) => Promise<unknown>;
    };
  }
}

async function start() {
  // Routes onomancy's Wasm panics to the console instead of losing them.
  initOnomancy();

  const storage = new IndexedDBStorageAdapter();

  const { hive, repo } = await initializeAutomergeRepoKeyhive({
    createRepo: (config) => new Repo(config),
    storage,
    // ARK appends a random component for peer uniqueness, so a plain label is
    // all the demo needs to pass.
    peerIdSuffix: "keyhive-demo",
    automaticArchiveIngestion: true,
    cachingMode: "periodic",
    syncServer: syncServer.SELECTION,
    repo: {
      storage,
      subductionWebsocketEndpoints: [syncServer.ENDPOINT],
      enableRemoteHeadsGossiping: true,
    },
  });

  // Debug handles.
  window.hive = hive;
  window.repo = repo;
  window.setDemoLogLevel = setDemoLogLevel;
  window.setSubductionLogLevel = setSubductionLogLevel;
  window.setKeyhiveLogLevel = setKeyhiveLogLevel;
  // A fixture, not a feature: seeds the onomancy test binding locally, since
  // the document it names structurally cannot replicate (ADR-023). Deliberately
  // console-only — a button would imply the demo can adopt bound documents in
  // general, which is exactly what it cannot do.
  window.seedOnotest = (target: string) => seedOnotest(repo, target);
  window.namestore = {
    build: (spec: Parameters<typeof buildBoundNamestore>[1]) =>
      buildBoundNamestore(repo, spec),
    save: (document: string) => downloadBoundNamestore(repo, document),
    load: (document: string, bytes: Uint8Array) =>
      importBoundNamestore(repo, document, bytes),
  };

  // Seed the shared phonebook if the sync server does not already have it (for
  // example a freshly started server). Fire-and-forget: the UI renders now and
  // picks up the phonebook once it loads or is seeded.
  void ensurePhonebook(repo);

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(<Frame automergeRepoKeyhive={hive} repo={repo} />);
}

start().catch((error) => {
  log.error("Failed to start:", error);
});
