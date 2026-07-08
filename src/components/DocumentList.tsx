import React from "react";
import {
  useDocument,
  AutomergeUrl,
  useRepo,
  isValidAutomergeUrl,
} from "@automerge/react/slim";
import { initTaskList, TaskList } from "./TaskList";
import { RootDocument } from "../rootDoc";
import { useState, useEffect } from "react";
import { AutomergeRepoKeyhiveRust } from "@automerge/automerge-repo-keyhive";
import { useReRenderOnDocProgress } from "../hooks";

interface DocumentListProps {
  docUrl: AutomergeUrl;
  selectedDocument: AutomergeUrl | null;
  onSelectDocument: (docUrl: AutomergeUrl | null) => void;
  hive: AutomergeRepoKeyhiveRust;
  keyhiveUpdateTracker: number;
}

export const DocumentList = ({
  docUrl,
  selectedDocument,
  onSelectDocument,
  hive,
  keyhiveUpdateTracker,
}: DocumentListProps) => {
  const repo = useRepo();
  const [doc, changeDoc] = useDocument<RootDocument>(docUrl, {
    suspense: true,
  });
  const [inputUrl, setInputUrl] = useState("");

  // Add selected document from URL to user's list if not already present
  useEffect(() => {
    if (!doc?.taskLists || !selectedDocument) return;
    if (doc.taskLists.includes(selectedDocument)) return;

    changeDoc((d) => {
      if (!d.taskLists.includes(selectedDocument)) {
        d.taskLists.push(selectedDocument);
      }
    });
  }, [selectedDocument, changeDoc, doc]);

  const handleNewDocument = async () => {
    try {
      const newTaskList = await repo.create2<TaskList>(initTaskList());

      // Give the sync server relay access so it can sync the document
      // without being able to read it.
      await hive.addSyncServerRelayToDoc(newTaskList.url);

      changeDoc((d) => {
        d.taskLists.push(newTaskList.url);
      });
      onSelectDocument(newTaskList.url);
    } catch (error) {
      console.error(`[Demo] Error creating new document: ${error}`);
    }
  };

  const handleDeleteDocument = (urlToDelete: AutomergeUrl) => {
    // Deselect first to prevent the useEffect from re-adding it
    if (urlToDelete === selectedDocument) {
      onSelectDocument(null);
    }

    // Use setTimeout to ensure onSelectDocument(null) takes effect before we delete
    setTimeout(() => {
      changeDoc((d) => {
        d.taskLists = d.taskLists.filter((url) => url !== urlToDelete);
      });
    }, 0);
  };

  const handleLoadUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl) {
      const url = `automerge:${inputUrl}`;
      if (isValidAutomergeUrl(url)) {
        const docUrl = url as AutomergeUrl;
        // Add the document to the user's list if it's not already there
        changeDoc((d) => {
          if (!d.taskLists.includes(docUrl)) {
            d.taskLists.push(docUrl);
          }
        });
        onSelectDocument(docUrl);
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
                <DocumentTitle
                  docUrl={docUrl}
                  keyhiveUpdateTracker={keyhiveUpdateTracker}
                />
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

const DocumentTitle: React.FC<{
  docUrl: AutomergeUrl;
  keyhiveUpdateTracker: number;
}> = React.memo(
  ({ docUrl }) => {
    // Re-render (and re-title) once the document syncs in, e.g. after the
    // viewer is granted access, without a page reload.
    useReRenderOnDocProgress(docUrl);
    const [doc] = useDocument<TaskList>(docUrl);

    if (!doc) {
      const docId = docUrl.replace("automerge:", "");
      const shortId = docId.length > 8 ? `${docId.slice(0, 8)}...` : docId;
      return (
        <span className="text-sm font-medium text-muted-foreground">
          {shortId} loading...
        </span>
      );
    }

    const title = doc.title || "Untitled Task List";
    return <span className="text-sm font-medium text-foreground">{title}</span>;
  },
  (prevProps, nextProps) => {
    // Only re-render if docUrl or keyhiveUpdateTracker changes
    return (
      prevProps.docUrl === nextProps.docUrl &&
      prevProps.keyhiveUpdateTracker === nextProps.keyhiveUpdateTracker
    );
  },
);
