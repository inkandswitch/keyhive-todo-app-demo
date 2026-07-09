import { useMemo, useSyncExternalStore } from "react";
import { AutomergeUrl, useRepo } from "@automerge/react/slim";

// Re-render the calling component whenever the repo's live query for a
// document changes state (loading / unavailable / ready). The fork's
// useDocument does not observe these transitions, so without this a document
// that was unavailable at first open (e.g. before the viewer was granted
// access) would stay blank until a full page reload even after access arrives.
// When keyhive access is granted, ARK's linkRepo calls
// repo.shareConfigChanged(), which drives the query back to ready and fires
// this subscription.
export function useReRenderOnDocProgress(docUrl: AutomergeUrl): void {
  const repo = useRepo();
  const query = useMemo(() => repo.findWithProgress(docUrl), [repo, docUrl]);
  useSyncExternalStore(
    (onChange) => query.subscribe(onChange),
    () => query.peek().state,
  );
}
