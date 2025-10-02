import React from "react";
import {
  useDocument,
  AutomergeUrl,
  useRepo,
  isValidAutomergeUrl,
} from "@automerge/react/slim";
import { initTaskList, TaskList } from "./TaskList";
import { RootDocument } from "../rootDoc";
import { useEffect, useState } from "react";
import { Access, type Individual, type Keyhive } from "@keyhive/keyhive/slim";
import { addMemberToDoc, SyncServer } from "@automerge/rootstock-identity";

type AccessString = "admin" | "write" | "read" | "pull";

interface DocumentListProps {
  docUrl: AutomergeUrl;
  selectedDocument: AutomergeUrl | null;
  onSelectDocument: (docUrl: AutomergeUrl | null) => void;
  syncServer: SyncServer;
  keyhive: Keyhive;
}

export const DocumentList = ({
  docUrl,
  selectedDocument,
  onSelectDocument,
  syncServer,
  keyhive,
}: DocumentListProps) => {
  console.log(`syncServer temp log: ${syncServer}`)
  const repo = useRepo();
  const [doc, changeDoc] = useDocument<RootDocument>(docUrl, {
    suspense: true,
  });
  const [inputUrl, setInputUrl] = useState("");

  useEffect(() => {
    if (!doc?.taskLists) return;
    changeDoc((d) => {
      if (selectedDocument && !d.taskLists.includes(selectedDocument)) {
        d.taskLists.push(selectedDocument);
      }
    });
  }, [selectedDocument, changeDoc, doc]);

  const handleNewDocument = async () => {
    try {
      const membersToAdd: [Individual, AccessString][] = [];

      // TODO: Fix sync server individual access - currently causes recursive borrow error
      // const serverIndividual = getSyncServerIndividual(syncServer, keyhive);
      // if (serverIndividual) {
      //   membersToAdd.push([serverIndividual, "pull"]);
      // } else {
      //   console.error("Missing syncServer individual!");
      // }

      console.log("Creating task list")
      const newTaskList = await repo.create2<TaskList>(initTaskList());
      console.log("Created task list")

      for (const [individual, cap] of membersToAdd) {
        console.log("About to call Access.tryFromString with cap:", cap);
        const access = Access.tryFromString(cap);
        console.log("Access.tryFromString returned:", access);
        if (!access) {
          console.error("Failed to derive Access");
          continue;
        }
        console.log("BEFORE addMemberToDoc with access:", access);
        try {
          await addMemberToDoc(
            keyhive,
            newTaskList.url,
            individual,
            access,
          );
          console.log("AFTER addMemberToDoc");
        } catch (err) {
          console.error("addMemberToDoc failed:", err);
          throw err;
        }
      }

      changeDoc((d) => d.taskLists.push(newTaskList.url));
      onSelectDocument(newTaskList.url);
      console.log("selected document");
    } catch (error) {
      console.error("Error creating new document: ", error);
    }
  };

  const handleDeleteDocument = (urlToDelete: AutomergeUrl) => {
    if (urlToDelete === selectedDocument) {
      onSelectDocument(null);
    }

    changeDoc((d) => {
      d.taskLists = d.taskLists.filter((url) => url !== urlToDelete);
    });
  };

  const handleLoadUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl) {
      const url = `automerge:${inputUrl}`;
      if (isValidAutomergeUrl(url)) {
        onSelectDocument(url as AutomergeUrl);
        setInputUrl("");
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Documents</h2>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-2 pb-6">
        <div className="space-y-1 mb-6">
          {doc?.taskLists?.map((docUrl) => (
            <div
              key={docUrl}
              className={`flex items-center justify-between py-2 px-3 rounded-md cursor-pointer text-sm transition-colors ${
                docUrl === selectedDocument
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
              onClick={() => onSelectDocument(docUrl)}
            >
              <div className="flex-grow min-w-0">
                <DocumentTitle docUrl={docUrl} />
              </div>
              <button
                className={`ml-2 w-5 h-5 flex items-center justify-center text-muted-foreground bg-transparent border-none rounded cursor-pointer transition-all duration-200 hover:text-destructive hover:bg-destructive/10 hover:opacity-100 ${
                  docUrl === selectedDocument ? "opacity-100" : "opacity-0"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteDocument(docUrl);
                }}
                aria-label="Delete task list"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar footer */}
      <div className="pt-8 px-4 pb-4 border-t border-border">
        <button
          onClick={handleNewDocument}
          className="w-full h-9 px-3 bg-secondary text-secondary-foreground border border-border rounded-md text-sm font-medium cursor-pointer mb-4 hover:bg-accent hover:border-ring transition-colors"
        >
          + New Document
        </button>

        <form onSubmit={handleLoadUrl} className="flex gap-2">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Document ID"
            className="flex-1 h-9 px-3 bg-background border border-border rounded-md text-sm text-foreground box-border"
          />
          <button
            type="submit"
            className="h-9 px-4 bg-secondary text-secondary-foreground border border-border rounded-md text-sm font-medium cursor-pointer whitespace-nowrap hover:bg-accent hover:border-ring transition-colors"
          >
            Load
          </button>
        </form>
      </div>
    </div>
  );
};

// Component to display document title
const DocumentTitle: React.FC<{ docUrl: AutomergeUrl }> = ({ docUrl }) => {
  const [doc] = useDocument<TaskList>(docUrl, { suspense: true });

  const title = doc.title || "Untitled Task List";
  return <span className="text-sm font-medium text-foreground">{title}</span>;
};
