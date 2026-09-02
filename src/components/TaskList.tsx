import {
  AutomergeUrl,
  useDocument,
  updateText,
  useRepo,
} from "@automerge/react/slim";
import { ShareModal } from "./ShareModal";
import { useState, useEffect, useMemo } from "react";
import {
  Access,
  AutomergeRepoKeyhive,
  docIdFromAutomergeUrl,
  isUnprotectedDoc,
} from "@automerge/automerge-repo-keyhive";
import { useReRenderOnDocProgress } from "@automerge/keyhive-react";
import { TaskList as TaskListDoc } from "../taskListDoc";
import { copyToClipboard } from "../clipboard";
import { log } from "../log";

function sameAccess(a: Access | undefined, b: Access | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.equals(b);
}

/**
 * This identity's effective access to a document, by whichever route grants it.
 *
 * One query, not a union: `bestAccessForDoc` calls `transitive_members()` and
 * covers direct membership, group-mediated membership, and public access.
 * `listMembers().find(isSelf)` is a strict subset, being public-blind.
 *
 * Do not trust the naming. `accessForDoc` is documented as "`id`'s **direct**
 * access" while its implementation is transitive, and `bestAccessForDoc`'s own
 * local variable is called `direct` while holding a transitive lookup.
 *
 * A legitimate group member was once told "You do not have access". That was
 * observed, but not caused by group-blindness here, and its real cause is
 * still unknown — possibly the `keyhiveVersion` timer-reset defect fixed
 * below. Recorded because a fix whose stated reason is false is one nobody can
 * safely revisit.
 */
async function effectiveAccess(
  hive: AutomergeRepoKeyhive,
  docUrl: AutomergeUrl
): Promise<Access | undefined> {
  // `bestAccessForDoc` alone. It is complete on all three axes — direct
  // membership, group-mediated membership, and the document's public access —
  // so nothing needs to be unioned with it.
  //
  // The naming misleads: `accessForDoc` is documented as "`id`'s **direct**
  // access" yet calls `transitive_members()`, and `bestAccessForDoc`'s own
  // local variable is named `direct` while holding a transitive lookup.
  //
  // Measured here rather than taken on report: an identity reaching a document
  // *only* through a group, never a direct member, reads `Admin` from both
  // calls. `listMembers().find(isSelf)` is a strict subset — it is public-blind
  // — so the union could only ever return what this returns.
  return hive.bestAccessForDoc(hive.active.individual.id, docUrl);
}

/**
 * How long a readable document may stay unreceived before we say so.
 *
 * Matches the namestore walk's hop timeout, and for the same reason: a
 * document this device is permitted to read but has not been sent produces no
 * error and no rejection, just an absence. Waiting forever renders as
 * "Loading..." and is indistinguishable from ordinary latency — the failure
 * mode has no stack and no catch, so nothing surfaces it but a clock.
 */
const DOC_WAIT_MS = 10_000;

interface TaskListProps {
  docUrl: AutomergeUrl;
  hive: AutomergeRepoKeyhive;
  keyhiveVersion: number;
}

export const TaskList = ({ docUrl, hive, keyhiveVersion }: TaskListProps) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [access, setAccess] = useState<Access | undefined>(undefined);
  const [accessChecked, setAccessChecked] = useState(false);
  // "We could not ask" is not "the answer is no". Tracked separately so the
  // two are never rendered as the same sentence. A thrown access check must
  // not land in `access === undefined` and print a flat denial, which is a
  // claim the app has not earned.
  const [checkFailed, setCheckFailed] = useState(false);
  // Keyhive has no state for this document at all 2014 a different thing from
  // being denied, and the only one of the two with no remedy.
  const [unknownToKeyhive, setUnknownToKeyhive] = useState(false);
  // A document we may read but have not received leaves `useDocument`
  // returning undefined forever, which renders as an indefinite "Loading...".
  // Bounding the wait turns a hang into a statement, exactly as the namestore
  // walk's hop timeout does.
  const [waitedForDoc, setWaitedForDoc] = useState(false);

  // Re-render when the document becomes available so a newly-granted doc
  // renders without a page reload (see useReRenderOnDocProgress).
  useReRenderOnDocProgress(useRepo(), docUrl);
  const [doc, changeDoc] = useDocument<TaskListDoc>(docUrl);

  const isUnprotected = useMemo(() => {
    try {
      return isUnprotectedDoc(docUrl);
    } catch {
      return false;
    }
  }, [docUrl]);

  // Check access to this document. Recalculated when keyhive state changes.
  useEffect(() => {
    let cancelled = false;

    if (isUnprotected) {
      setAccess(undefined);
      setAccessChecked(true);
      setCheckFailed(false);
      return;
    }

    async function fetchAccess() {
      try {
        // Direct, public and through-a-group access all count. See
        // `effectiveAccess`: no single keyhive call covers all three.
        const best = await effectiveAccess(hive, docUrl);
        // Whether keyhive has any state for this document at all.
        //
        // Distinct from "we are not a member", and the two are indistinguishable
        // from access alone — both leave `best` undefined. A document keyhive
        // has never heard of is not one we were denied: nobody can grant access
        // to it, no replica can arrive, and waiting cannot help. Telling a
        // reader "you do not have access" points them at a remedy that does not
        // exist.
        //
        // Reachable in practice: an id minted outside keyhive is classified as
        // protected by shape (ADR-023), so an onomancy-bound document imported
        // here lands in exactly this state.
        const known = await hive.keyhive
          .getDocument(docIdFromAutomergeUrl(docUrl))
          .then((d) => Boolean(d))
          .catch(() => false);

        if (!cancelled) {
          setAccess((prev) => (sameAccess(prev, best) ? prev : best));
          setCheckFailed(false);
          setUnknownToKeyhive(!known);
        }
      } catch (error) {
        if (!cancelled) {
          log.error("Error checking access level:", error);
          setAccess(undefined);
          setCheckFailed(true);
        }
      } finally {
        if (!cancelled) setAccessChecked(true);
      }
    }

    void fetchAccess();

    return () => {
      cancelled = true;
    };
  }, [keyhiveVersion, docUrl, hive, isUnprotected]);

  // Bound the wait for a document we are allowed to read.
  //
  // Keyed on the document alone, NOT on `keyhiveVersion`. That counter is
  // bumped by `useKeyhiveUpdates` on every remote ingest, debounced at 100ms,
  // so any device receiving anything at all restarts this timer faster than it
  // can fire — disabling the bound in exactly the case it exists for, since a
  // device syncing other documents is the normal one. It is a heartbeat, not a
  // version: safe to re-read on, unsafe to reset a timer on.
  //
  // Nothing is lost by leaving it out. A late grant flips `canRead` and a late
  // replica defines `doc`; both exit this branch on their own.
  useEffect(() => {
    setWaitedForDoc(false);
    const timer = setTimeout(() => setWaitedForDoc(true), DOC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [docUrl]);

  const canRead = isUnprotected || (access?.isReader ?? false);
  const canEdit = isUnprotected || (access?.isEditor ?? false);
  // Relay access doesn't allow you to delegate or revoke, so read access
  // is required to share a doc.
  const canShare = !isUnprotected && canRead;
  const docId = docUrl.replace("automerge:", "");

  // Wait for the first access check, and for an accessible document to finish
  // syncing, before deciding what to show — but only for a bounded time.
  if (!accessChecked || (canRead && !doc && !waitedForDoc)) {
    return (
      <div className="h-full flex items-center justify-center bg-muted text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Three different unhappy states, deliberately worded apart. They are not
  // the same claim, and only the first is about permission at all.
  const unavailable = checkFailed
    ? "Could not check your access to this document. That is not a refusal: the" +
      " check itself failed, most likely because this device is not connected" +
      " to a sync server. Retrying when the connection returns."
    : canRead && !doc
      ? "You have access to this document, but no copy of it has reached this" +
        " device yet. This is not evidence that it is empty or gone — only that" +
        " nothing arrived in the time allowed. It will appear if a copy syncs."
      : null;

  if (unavailable) {
    return (
      <div className="h-full flex items-center justify-center bg-muted">
        <p className="max-w-md px-6 text-center text-sm text-muted-foreground">
          {unavailable}
        </p>
      </div>
    );
  }

  if (!canRead || !doc) {
    return (
      <div className="h-full flex flex-col bg-muted">
        <div className="flex-1 overflow-y-auto flex justify-center items-start py-8">
          <div className="w-full max-w-2xl px-6">
            <div className="bg-background rounded-lg p-6 shadow-sm">
              <div className="pb-6 mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm text-muted-foreground">
                    Doc ID: {docId}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      void copyToClipboard(docId);
                    }}
                    className="px-2 py-1 text-xs font-medium text-secondary-foreground bg-secondary border border-border rounded hover:bg-accent"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  {unknownToKeyhive
                    ? "This document is unknown to keyhive on this device — it has no access control here, so no one can grant you access and no replica can arrive. It was most likely created outside keyhive."
                    : "You do not have access to this document"}
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
            {isUnprotected && (
              <div className="mb-6 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                This document is{" "}
                <span className="font-medium">unprotected</span>.
              </div>
            )}
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
                    canShare ? () => setIsShareModalOpen(true) : undefined
                  }
                  disabled={!canShare}
                  className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
                    canShare
                      ? "bg-secondary text-secondary-foreground border-border cursor-pointer hover:bg-accent hover:border-ring"
                      : "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-50"
                  }`}
                >
                  Share
                </button>
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm text-muted-foreground">
                  Doc ID: {docId}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(docId);
                  }}
                  className="px-2 py-1 text-xs font-medium text-secondary-foreground bg-secondary border border-border rounded hover:bg-accent"
                >
                  Copy
                </button>
              </div>
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
                      })
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
                              e.target.value
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
        hive={hive}
        keyhiveVersion={keyhiveVersion}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};
