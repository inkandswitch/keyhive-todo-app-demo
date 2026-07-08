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
import { useState, useEffect, Component, type ReactNode } from "react";
import { Phonebook } from "../phonebook";
import { Identity } from "../active";
import {
  AutomergeRepoKeyhiveSubduction,
  uint8ArrayToHex,
  ContactCard,
  KEYHIVE_SYNC_SERVER_CONTACT_CARD_JSON,
  KEYHIVE_SYNC_SERVER_PEER_ID,
} from "@automerge/automerge-repo-keyhive";

type AppProps = {
  docUrl: AutomergeUrl;
  automergeRepoKeyhive: AutomergeRepoKeyhiveSubduction;
};

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[Demo] Caught error:", error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function App({ docUrl, automergeRepoKeyhive }: AppProps) {
  const [keyhiveUpdateTracker, setKeyhiveUpdateTracker] = useState(0);

  // Watch for keyhive updates - debounced to avoid excessive re-renders
  useEffect(() => {
    let timeoutId: number;
    const handler = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setKeyhiveUpdateTracker((v) => v + 1);
      }, 100);
    };

    // "update" fires for locally-originated keyhive changes; remote ops
    // arriving over sync signal "ingest-remote" on the network adapter.
    automergeRepoKeyhive.emitter.on("update", handler);
    automergeRepoKeyhive.networkAdapter.on("ingest-remote", handler);
    return () => {
      clearTimeout(timeoutId);
      automergeRepoKeyhive.emitter.off("update", handler);
      automergeRepoKeyhive.networkAdapter.off("ingest-remote", handler);
    };
  }, [automergeRepoKeyhive.emitter, automergeRepoKeyhive.networkAdapter]);

  const phonebookUrl = "automerge:4LC8WQxBbLH92x9crDq5HwhUYopU" as AutomergeUrl;
  const identity: Identity = {
    active: automergeRepoKeyhive.active,
    contact: {
      peerId: automergeRepoKeyhive.active.peerId,
      avatar: null,
    },
  };
  const [identityState, setIdentityState] = useState(identity);
  const [phonebook, changePhonebook] = useDocument<Phonebook>(phonebookUrl);

  // Load user's saved info from phonebook on startup
  useEffect(() => {
    if (phonebook && identityState.active.individual) {
      const userHexId = uint8ArrayToHex(
        identityState.active.individual.id.toBytes(),
      );
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

  // Add sync server to phonebook if not already there. The demo targets the
  // canonical keyhive sync server identity (also used by the local dev
  // server), so its contact card is a known constant.
  useEffect(() => {
    if (!phonebook) return;
    const serverContactCard = ContactCard.fromJson(
      KEYHIVE_SYNC_SERVER_CONTACT_CARD_JSON,
    );
    if (!serverContactCard) return;
    const serverHexId = uint8ArrayToHex(serverContactCard.individualId.bytes);
    if (!phonebook[serverHexId]) {
      // Load HAL avatar and add to phonebook
      fetch(halAvatarUrl)
        .then((res) => res.arrayBuffer())
        .then((buffer) => {
          changePhonebook((doc) => {
            doc[serverHexId] = {
              peerId: KEYHIVE_SYNC_SERVER_PEER_ID,
              name: "Demo Sync Server",
              avatar: new Uint8Array(buffer),
            };
          });
        });
    }
  }, [phonebook, changePhonebook]);

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
          hive={automergeRepoKeyhive}
          keyhiveUpdateTracker={keyhiveUpdateTracker}
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
            <ErrorBoundary key={selectedDocUrl}>
              <TaskList
                docUrl={selectedDocUrl}
                phonebook={phonebook}
                hive={automergeRepoKeyhive}
                identity={identityState}
                keyhiveUpdateTracker={keyhiveUpdateTracker}
              />
            </ErrorBoundary>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground bg-muted">
              Select or create a document from the sidebar
            </div>
          )}
        </div>
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
