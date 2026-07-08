import { AutomergeUrl } from "@automerge/react/slim";

// The per-identity root document. It is a plain (legacy) Automerge document
// that holds the list of task lists this identity has opened. It is created
// locally in Frame.tsx and never shared, so it does not need keyhive access
// control.
export type RootDocument = {
  taskLists: AutomergeUrl[];
};
