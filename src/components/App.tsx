import keyhiveLogo from "/honeybee.png";
import { isValidAutomergeUrl, type AutomergeUrl, useDocument, Message } from "@automerge/react";
import { TaskList } from "./TaskList";
import { DocumentList } from "./DocumentList";
import { useHash } from "react-use";
import { AvatarIcon } from "./AvatarIcon";
import { UserModal } from "./UserModal";
import { useState, useEffect, useCallback } from "react";
import { AppData } from "../user";
import { Archive, Keyhive } from "@keyhive/keyhive";
import { IdentitiesDocument } from "@automerge/rootstock-identity";

type AppProps = {
  docUrl: AutomergeUrl;
  identitiesUrl: AutomergeUrl;
  appData: AppData;
  storeKeyhiveFn: (kh: Keyhive, shouldSync?: boolean) => void;
}

function App({ docUrl, identitiesUrl, appData, storeKeyhiveFn }: AppProps) {
  const [keyhiveUpdateTracker, setKeyhiveUpdateTracker] = useState(0);
  const storeKeyhive = useCallback((kh: Keyhive, shouldSync: boolean = true) => {
    storeKeyhiveFn(kh, shouldSync);
    setKeyhiveUpdateTracker(v => v + 1);
  }, [storeKeyhiveFn]);

  // TODO: Add real keyhive event and remove this `as any`
  (appData.keyhiveNetworkAdapter as any).on("keyhive", (msg: Message) => {
    if (msg.data) {
      const archive = new Archive(msg.data);
      appData.keyhive.ingestArchive(archive);
      // Store without syncing back
      storeKeyhive(appData.keyhive, false);
    } else {
      console.error("Expected keyhive data not found in received Message")
    }
  })

  // Polling for keyhive updates
  useEffect(() => {
    const requestKeyhive = async () => {
      appData.keyhiveNetworkAdapter.requestKeyhive()
    };

    const interval = setInterval(requestKeyhive, 5000);
    return () => clearInterval(interval);
  }, [appData.keyhiveNetworkAdapter]);

  const [activeState, setActiveState] = useState(appData.active);
  const [identitiesDoc, changeIdentitiesDoc] = useDocument<IdentitiesDocument>(identitiesUrl, {
    suspense: true,
  });
  const [hash, setHash] = useHash();
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  // Remove the leading '#'
  const cleanHash = hash.slice(1);
  const selectedDocUrl =
    cleanHash && isValidAutomergeUrl(cleanHash)
      ? (cleanHash as AutomergeUrl)
      : null;

  return (
    <div className="flex w-screen h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-card">
        <DocumentList
          docUrl={docUrl}
          identitiesDocUrl={identitiesUrl}
          onSelectDocument={(url) => {
            if (url) {
              setHash(url);
            } else {
              setHash("");
            }
          }}
          selectedDocument={selectedDocUrl}
          syncServer={appData.syncServer}
          keyhive={appData.keyhive}
          storeKeyhive={storeKeyhive}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-muted">
        {/* Header */}
        <header className="p-6 border-b border-foreground/10 bg-muted flex justify-center relative">
          <h1 className="text-2xl font-semibold flex items-center text-foreground">
            <img src={keyhiveLogo} alt="Keyhive logo" id="keyhive-logo" />
            Keyhive Demo
          </h1>
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <AvatarIcon onClick={() => setIsUserModalOpen(true)} activeState={activeState} />
          </div>
        </header>

        {/* Document */}
        <div className="flex-1 overflow-hidden">
          {selectedDocUrl ? (
            <TaskList docUrl={selectedDocUrl} identitiesDoc={identitiesDoc} keyhive={appData.keyhive} storeKeyhive={storeKeyhive} active={activeState} keyhiveUpdateTracker={keyhiveUpdateTracker} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground bg-muted">
              Select or create a document from the sidebar
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-border px-6 py-3 flex items-center justify-between bg-background">
          <p className="text-sm text-muted-foreground">
            Powered by Automerge + Vite + React + TypeScript
          </p>
        </footer>
      </div>
      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        activeState={activeState}
        setActiveState={setActiveState}
        identitiesDoc={identitiesDoc}
        changeIdentitiesDoc={changeIdentitiesDoc}
        db={appData.db}
      />
    </div>
  );
}

export default App;
