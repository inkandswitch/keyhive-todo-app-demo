import keyhiveLogo from "/honeybee.png";
import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  useDocument,
  Message,
} from "@automerge/react/slim";
import { TaskList } from "./TaskList";
import { DocumentList } from "./DocumentList";
import { useHash } from "react-use";
import { AvatarIcon } from "./AvatarIcon";
import { UserModal } from "./UserModal";
import { useState, useEffect, useCallback } from "react";
import { Archive, Keyhive } from "@keyhive/keyhive/slim";
import { KeyhiveKit } from "@automerge/rootstock-identity";
import { Phonebook } from "../phonebook";
import { Identity } from "../active";

type AppProps = {
  docUrl: AutomergeUrl;
  keyhiveKit: KeyhiveKit;
  storeKeyhiveFn: (kh: Keyhive, shouldSync?: boolean) => void;
};

function App({ docUrl, keyhiveKit, storeKeyhiveFn }: AppProps) {
  const [keyhiveUpdateTracker, setKeyhiveUpdateTracker] = useState(0);

  // FIXME: Remove this and listen directly for keyhive mutation events
  // to update the tracker
  const storeKeyhive = useCallback(
    (kh: Keyhive, shouldSync: boolean = true) => {
      storeKeyhiveFn(kh, shouldSync);
      setKeyhiveUpdateTracker((v) => v + 1);
    },
    [storeKeyhiveFn],
  );

  // FIXME: Move out of demo code
  // TODO: Add real keyhive event and remove this `as any`
  (keyhiveKit.keyhiveAdapter as any).on("keyhive", (msg: Message) => {
    if (msg.data) {
      const archive = new Archive(msg.data);
      keyhiveKit.keyhive.ingestArchive(archive);
      // Store without syncing back
      storeKeyhive(keyhiveKit.keyhive, false);
    } else {
      console.error("Expected keyhive data not found in received Message");
    }
  });

  // FIXME: Move out of demo code
  // Polling for keyhive updates
  useEffect(() => {
    const requestKeyhive = async () => {
      keyhiveKit.keyhiveAdapter.requestKeyhive();
    };

    const interval = setInterval(requestKeyhive, 5000);
    return () => clearInterval(interval);
  }, [keyhiveKit.keyhiveAdapter]);

  const phonebookUrl = "automerge:4LC8WQxBbLH92x9crDq5HwhUYopU" as AutomergeUrl;
  const identity: Identity = {
    active: keyhiveKit.active,
    contact: {
      peerId: keyhiveKit.active.peerId,
      avatar: null,
    },
  };
  const [identityState, setIdentityState] = useState(identity);
  const [phonebook, changePhonebook] = useDocument<Phonebook>(phonebookUrl, {
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
          onSelectDocument={(url) => {
            if (url) {
              setHash(url);
            } else {
              setHash("");
            }
          }}
          selectedDocument={selectedDocUrl}
          syncServer={keyhiveKit.syncServer}
          keyhive={keyhiveKit.keyhive}
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
            <AvatarIcon
              onClick={() => setIsUserModalOpen(true)}
              identityState={identityState}
            />
          </div>
        </header>

        {/* Document */}
        <div className="flex-1 overflow-hidden">
          {selectedDocUrl ? (
            <TaskList
              docUrl={selectedDocUrl}
              phonebook={phonebook}
              keyhive={keyhiveKit.keyhive}
              storeKeyhive={storeKeyhive}
              identity={identityState}
              keyhiveUpdateTracker={keyhiveUpdateTracker}
            />
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
        identityState={identityState}
        setIdentityState={setIdentityState}
        phonebook={phonebook}
        changePhonebook={changePhonebook}
      />
    </div>
  );
}

export default App;
