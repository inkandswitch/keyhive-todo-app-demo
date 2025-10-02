import { AutomergeUrl, useDocument, updateText } from "@automerge/react/slim";
import { ShareModal } from "./ShareModal";
import { useState, useMemo } from "react";
import { docIdFromAutomergeUrl } from "@automerge/rootstock-identity";
import { Keyhive } from "@keyhive/keyhive/slim";
import { Phonebook } from "../phonebook";
import { Identity } from "../active";

export interface Task {
  title: string;
  done: boolean;
}

export interface TaskList {
  title: string;
  tasks: Task[];
}

// A helper function to consistently initialize a task list.
export function initTaskList() {
  return {
    title: `TODO: ${new Date().toLocaleString()}`,
    tasks: [{ done: false, title: "" }],
  };
}

interface TaskListProps {
  docUrl: AutomergeUrl;
  phonebook: Phonebook;
  keyhive: Keyhive;
  identity: Identity;
  keyhiveUpdateTracker: number;
}

export const TaskList = ({
  docUrl,
  phonebook,
  keyhive,
  identity,
  keyhiveUpdateTracker,
}: TaskListProps) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [doc, changeDoc] = useDocument<TaskList>(docUrl, {
    // This hooks the `useDocument` into reacts suspense infrastructure so the whole component
    // only renders once the document is loaded
    suspense: true,
  });

  // Check if greater than pull access. Recalculate when keyhive updates.
  const shouldShowShareButton = useMemo(() => {
    const id = identity.active.individual.id;
    // FIXME: This should probably be an error
    if (!id) return false;

    const keyhiveDocId = docIdFromAutomergeUrl(docUrl);

    try {
      console.log("BEFORE accessForDoc");
      const access = keyhive.accessForDoc(id, keyhiveDocId);
      console.log("AFTER accessForDoc");
      if (access) {
        return access.toString() !== "Pull";
      } else {
        return false;
      }
    } catch (error) {
      console.error(`Error checking access level: ${error}`);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyhiveUpdateTracker, identity.active.individual.id, docUrl, keyhive]);

  const userAccess = useMemo(() => {
    const id = identity.active.individual.id;
    // FIXME: This should probably be an error
    if (!id) return undefined;

    const keyhiveDocId = docIdFromAutomergeUrl(docUrl);

    try {
      console.log("BEFORE accessForDoc");
      const access = keyhive.accessForDoc(id, keyhiveDocId);
      console.log("AFTER accessForDoc");
      return access ? access.toString() : undefined;
    } catch (error) {
      console.error("Error checking access level:", error);
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyhiveUpdateTracker, identity.active.individual.id, docUrl, keyhive]);

  const canEdit = userAccess === "Write" || userAccess === "Admin";
  const canRead =
    userAccess === "Read" || userAccess === "Write" || userAccess === "Admin";

  if (!canRead) {
    return (
      <div className="h-full flex flex-col bg-muted">
        <div className="flex-1 overflow-y-auto flex justify-center items-start py-8">
          <div className="w-full max-w-2xl px-6">
            <div className="bg-background rounded-lg p-6 shadow-sm">
              <div className="pb-6 mb-6">
                <div className="flex items-center gap-3 mb-6">
                  <h1 className="flex-1 text-lg font-medium text-foreground">
                    {doc.title}
                  </h1>
                </div>
                <h2 className="text-sm text-muted-foreground">
                  List ID: {docUrl.replace("automerge:", "")}
                </h2>
              </div>
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  You do not have access to this document
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-muted">
      <div className="flex-1 overflow-y-auto flex justify-center items-start py-8">
        <div className="w-full max-w-2xl px-6">
          <div className="bg-background rounded-lg p-6 shadow-sm">
            <div className="pb-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                {canEdit ? (
                  <input
                    type="text"
                    value={doc.title}
                    onChange={(e) =>
                      changeDoc((d) => {
                        updateText(d, ["title"], e.target.value);
                      })
                    }
                    className="flex-1 px-3 py-2 border border-border rounded-md text-lg font-medium bg-background text-foreground"
                  />
                ) : (
                  <h1 className="flex-1 text-lg font-medium text-foreground">
                    {doc.title}
                  </h1>
                )}
                <button
                  type="button"
                  onClick={
                    shouldShowShareButton
                      ? () => setIsShareModalOpen(true)
                      : undefined
                  }
                  disabled={!shouldShowShareButton}
                  className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
                    shouldShowShareButton
                      ? "bg-secondary text-secondary-foreground border-border cursor-pointer hover:bg-accent hover:border-ring"
                      : "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-50"
                  }`}
                >
                  Share
                </button>
              </div>
              <h2 className="text-sm text-muted-foreground">
                List ID: {docUrl.replace("automerge:", "")}
              </h2>
            </div>

            {canEdit && (
              <div className="flex justify-start items-center mb-2">
                <button
                  type="button"
                  onClick={() => {
                    changeDoc((d) =>
                      d.tasks.unshift({
                        title: "",
                        done: false,
                      }),
                    );
                  }}
                  className="px-4 py-2 bg-secondary text-secondary-foreground border border-border rounded-md text-sm font-medium cursor-pointer hover:bg-accent hover:border-ring transition-colors"
                >
                  + New task
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {doc &&
                doc.tasks?.map(({ title, done }, index) => (
                  <div className="flex items-center gap-3" key={index}>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={
                        canEdit
                          ? () =>
                              changeDoc((d) => {
                                d.tasks[index].done = !d.tasks[index].done;
                              })
                          : undefined
                      }
                      disabled={!canEdit}
                      className={`w-4 h-4 accent-primary ${!canEdit ? "cursor-not-allowed opacity-50" : ""}`}
                    />

                    {canEdit ? (
                      <input
                        type="text"
                        placeholder="What needs doing?"
                        value={title || ""}
                        onChange={(e) =>
                          changeDoc((d) => {
                            updateText(
                              d,
                              ["tasks", index, "title"],
                              e.target.value,
                            );
                          })
                        }
                        className={`flex-1 px-3 py-2 border border-border rounded-md text-sm bg-background ${
                          done
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      />
                    ) : (
                      <div
                        className={`flex-1 px-3 py-2 text-sm ${
                          done
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {title || ""}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
      <ShareModal
        isOpen={isShareModalOpen}
        docUrl={docUrl}
        phonebook={phonebook}
        keyhive={keyhive}
        keyhiveUpdateTracker={keyhiveUpdateTracker}
        identity={identity}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};
