import keyhiveLogo from "../assets/honeybee.png";
import halAvatarUrl from "../assets/HAL-9000.webp";
import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  useDocument,
} from "@automerge/react/slim";
import { TaskList } from "./TaskList";
import { DocumentList } from "./DocumentList";
import { useHash } from "react-use";
import { AvatarIcon } from "./AvatarIcon";
import { UserModal } from "./UserModal";
import { useState, useEffect } from "react";
import { KeyhiveKit } from "@automerge/identity";
import { Phonebook } from "../phonebook";
import { Identity } from "../active";
import { uint8ArrayToHex } from "@automerge/automerge-keyhive-network-adapter";
import { ContactCard } from "@keyhive/keyhive/slim";

type AppProps = {
  docUrl: AutomergeUrl;
  keyhiveKit: KeyhiveKit;
};

function App({ docUrl, keyhiveKit }: AppProps) {
  const [keyhiveUpdateTracker, setKeyhiveUpdateTracker] = useState(0);

  // Watch for keyhive updates
  useEffect(() => {
    const handler = () => {
      setKeyhiveUpdateTracker((v) => v + 1);
    };

    keyhiveKit.emitter.on("update", handler);
    return () => {
      keyhiveKit.emitter.off("update", handler);
    };
  }, [keyhiveKit.emitter]);

  const phonebookUrl = "automerge:4LC8WQxBbLH92x9crDq5HwhUYopU" as AutomergeUrl;
  const identity: Identity = {
    active: keyhiveKit.active,
    contact: {
      peerId: keyhiveKit.active.peerId,
      avatar: null,
    },
  };
  const [identityState, setIdentityState] = useState(identity);
  const [phonebook, changePhonebook] = useDocument<Phonebook>(phonebookUrl);

  // Load user's saved info from phonebook on startup
  useEffect(() => {
    if (phonebook && identityState.active.individual) {
      const userHexId = uint8ArrayToHex(identityState.active.individual.id.toBytes());
      const savedContact = phonebook[userHexId];
      if (savedContact) {
        setIdentityState((prev) => ({
          ...prev,
          contact: {
            peerId: prev.contact.peerId,
            name: savedContact.name,
            avatar: savedContact.avatar,
          },
        }));
      }
    }
  }, [phonebook, identityState.active.individual]);

  // Add sync server to phonebook if not already there
  useEffect(() => {
    if (phonebook && keyhiveKit.syncServer) {
      const serverContactCard = ContactCard.fromJson(keyhiveKit.syncServer.contactCard);
      // const serverIndividual = getSyncServerIndividual(keyhiveKit.syncServer, keyhiveKit.keyhive);
      if (serverContactCard) {
        const serverHexId = uint8ArrayToHex(serverContactCard.id.bytes);
        if (!phonebook[serverHexId]) {
          // Load HAL avatar and add to phonebook
          fetch(halAvatarUrl)
            .then((res) => res.arrayBuffer())
            .then((buffer) => {
              changePhonebook((doc) => {
                doc[serverHexId] = {
                  peerId: keyhiveKit.syncServer.peerId,
                  name: "Demo Sync Server",
                  avatar: new Uint8Array(buffer),
                };
              });
            });
        }
      }
    }
  }, [phonebook, keyhiveKit.syncServer, keyhiveKit.keyhive, changePhonebook]);

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
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-muted">
        {/* Header */}
        <header className="p-6 border-b border-foreground/10 bg-muted flex justify-center relative">
          <h1 className="text-2xl font-semibold flex items-center text-foreground">
            <img
              src={keyhiveLogo}
              alt="Keyhive logo"
              id="keyhive-logo"
            />
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
