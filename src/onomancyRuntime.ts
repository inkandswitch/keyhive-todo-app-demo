// The onomancy runtime handed to @automerge/keyhive-react.
//
// The library imports nothing from onomancy at runtime, exactly as it imports
// nothing from ARK, so this is the only route by which the Wasm reaches it and
// the app's single instance stays single. Mirrors keyhiveRuntime.ts.

import * as onomancy from "@inkandswitch/onomancy";
import { createOnomancyRuntime } from "@automerge/keyhive-react/onomancy";

// The subpath, not the main entry: everything that *resolves* a name lives
// there, while the main entry only knows what a claim is and how to render its
// status. The module goes across whole, so the runtime gets both
// `resolveHostname` and the `Name` grammar without this file naming either.
export const onomancyRuntime = createOnomancyRuntime(onomancy);
