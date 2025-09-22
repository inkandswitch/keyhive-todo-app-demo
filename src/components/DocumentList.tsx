import React from "react";
import { useDocument, AutomergeUrl, useRepo, isValidAutomergeUrl } from "@automerge/react";
import { initTaskList, TaskList } from "./TaskList";
import { RootDocument } from "../rootDoc";
import { useEffect, useState } from "react";
import { AccessString } from "../user";
import { generateDoc } from "../doc";
import { SyncServer } from "../server";
import { IdentitiesDocument } from "../identities";
import { Individual, Keyhive } from "@keyhive/wasm";

interface DocumentListProps {
  docUrl: AutomergeUrl;
  identitiesDocUrl: AutomergeUrl;
  selectedDocument: AutomergeUrl | null;
  onSelectDocument: (docUrl: AutomergeUrl | null) => void;
  syncServer: SyncServer;
  keyhive: Keyhive;
  storeKeyhive: (kh: Keyhive) => void;
}

export const DocumentList = ({ docUrl, identitiesDocUrl, selectedDocument, onSelectDocument, syncServer, keyhive, storeKeyhive }: DocumentListProps) => {
  const repo = useRepo();
  const [doc, changeDoc] = useDocument<RootDocument>(docUrl, {
    suspense: true,
  });
  const [, changeIdentitiesDoc] = useDocument<IdentitiesDocument>(identitiesDocUrl, {
    suspense: true,
  });
  const [inputUrl, setInputUrl] = useState("");

  useEffect(() => {
    changeDoc((d) => {
      if (selectedDocument && !d.taskLists.includes(selectedDocument)) {
        d.taskLists.push(selectedDocument);
      }
    });
  }, [selectedDocument, changeDoc]);

  const handleNewDocument = async () => {
    try {
      const membersToAdd: [Individual, AccessString][] = []

      if (syncServer.individual) {
        membersToAdd.push([syncServer.individual, "pull"])
      } else {
        console.log("Missing syncServer individual!")
      }

      const newTaskList = await generateDoc(
        keyhive,
        changeIdentitiesDoc,
        membersToAdd,
        () => repo.create<TaskList>(initTaskList()),
        storeKeyhive
      );

      changeDoc((d) => d.taskLists.push(newTaskList.url));
      onSelectDocument(newTaskList.url);
    } catch (error) {
      console.error("Error creating new document: ", error);
    }
  };

  const handleDeleteDocument = (urlToDelete: AutomergeUrl) => {
    if (urlToDelete === selectedDocument) {
      onSelectDocument(null);
    }

    changeDoc((d) => {
      d.taskLists = d.taskLists.filter(url => url !== urlToDelete);
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
          {doc.taskLists.map((docUrl) => (
            <div
              key={docUrl}
              className={`flex items-center justify-between py-2 px-3 rounded-md cursor-pointer text-sm transition-colors ${
                docUrl === selectedDocument
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-muted'
              }`}
              onClick={() => onSelectDocument(docUrl)}
            >
              <div className="flex-grow min-w-0">
                <DocumentTitle docUrl={docUrl} />
              </div>
              <button
                className={`ml-2 w-5 h-5 flex items-center justify-center text-muted-foreground bg-transparent border-none rounded cursor-pointer transition-all duration-200 hover:text-destructive hover:bg-destructive/10 hover:opacity-100 ${
                  docUrl === selectedDocument ? 'opacity-100' : 'opacity-0'
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
