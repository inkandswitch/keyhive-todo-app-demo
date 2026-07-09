import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Force a single copy of the automerge and subduction modules, resolved from
// this project's node_modules. The linked automerge-repo-keyhive package has
// its own node_modules, and a duplicate copy of a WASM-backed module is a
// separate module instance, which breaks wasm-bindgen instanceof checks
// ("expected instance of Topic/PeerId"). Same approach as the TPW vite
// configs.
const automergeEntryDir = dirname(
  fileURLToPath(import.meta.resolve("@automerge/automerge")),
);
const subductionEsmDir = dirname(
  fileURLToPath(import.meta.resolve("@automerge/automerge-subduction")),
);
const repoEntryDir = dirname(
  fileURLToPath(import.meta.resolve("@automerge/automerge-repo")),
);

export default defineConfig({
  define: {
    // Sync server websocket endpoint. Defaults to the public keyhive sync
    // server. Override with SYNC_SERVER, e.g. SYNC_SERVER=ws://localhost:3030
    // for a local dev server.
    __SYNC_SERVER__: JSON.stringify(
      process.env.SYNC_SERVER || "wss://keyhive.sync.automerge.org",
    ),
    // Sync server identity: its signed contact card JSON and its keyhive peer
    // id. Both must be set together, and they must match the identity the
    // configured SYNC_SERVER actually runs. When left unset the demo uses the
    // built-in "keyhive" identity, which the public keyhive sync server and a
    // stock local subduction_cli dev server both run.
    __SYNC_SERVER_CONTACT_CARD__: JSON.stringify(
      process.env.SYNC_SERVER_CONTACT_CARD || "",
    ),
    __SYNC_SERVER_PEER_ID__: JSON.stringify(
      process.env.SYNC_SERVER_PEER_ID || "",
    ),
  },
  base: "./",
  server: {
    port: 5557,
    open: true,
    watch: {
      ignored: ["!**/node_modules/@automerge/automerge-repo-keyhive/**"],
    },
  },

  build: {
    sourcemap: "inline",
    target: "esnext",
    assetsInlineLimit: 100000,
    rollupOptions: {
      input: "./index.html",
    },
  },

  resolve: {
    // Each entry is anchored ($) so it matches only the exact bare/slim
    // specifier, not subpaths. The packages expose subpath exports (e.g.
    // "@automerge/automerge-repo/helpers/cbor.js"); a greedy prefix alias
    // would rewrite those onto the entry file ("fullfat.js/helpers/cbor.js",
    // ENOTDIR), so subpaths must fall through to normal resolution. The "ws"
    // entry shims the Node websocket package with an ES module, since its
    // CJS-only browser stub cannot be imported by the source-served packages
    // that re-export the (unused) WebSocketServerAdapter.
    alias: [
      {
        find: /^@automerge\/automerge\/slim$/,
        replacement: resolve(automergeEntryDir, "slim.js"),
      },
      {
        find: /^@automerge\/automerge$/,
        replacement: resolve(automergeEntryDir, "fullfat_bundler.js"),
      },
      // web.js self-initializes the web-target bindings from inlined base64.
      // Do NOT use bundler.js here: it wires the wasm's JS callbacks to the
      // bundler-target bindings while slim.js re-exports the web-target
      // bindings, creating two parallel class tables over one wasm instance
      // ("expected instance of Topic/PeerId" from wasm-side assertions).
      {
        find: /^@automerge\/automerge-subduction\/slim$/,
        replacement: resolve(subductionEsmDir, "slim.js"),
      },
      {
        find: /^@automerge\/automerge-subduction$/,
        replacement: resolve(subductionEsmDir, "web.js"),
      },
      {
        find: /^@automerge\/automerge-repo\/slim$/,
        replacement: resolve(repoEntryDir, "slim.js"),
      },
      {
        find: /^@automerge\/automerge-repo$/,
        replacement: resolve(repoEntryDir, "fullfat.js"),
      },
      {
        find: "ws",
        replacement: new URL("./src/shims/ws.ts", import.meta.url).pathname,
      },
    ],
    dedupe: ["@keyhive/keyhive"],
  },

  // Prevent pre-bundling of the automerge and keyhive packages. Pre-bundling
  // drops WASM ESM imports, ignores the aliases above, and bakes a private
  // copy of any WASM-backed dependency into the optimized chunk.
  optimizeDeps: {
    exclude: [
      "@automerge/automerge",
      "@automerge/automerge/slim",
      "@automerge/automerge-repo",
      "@automerge/automerge-repo/slim",
      "@automerge/automerge-repo-storage-indexeddb",
      "@automerge/automerge-repo-network-websocket",
      "@automerge/react",
      "@automerge/automerge-subduction",
      "@automerge/automerge-subduction/slim",
      "@automerge/automerge-repo-keyhive",
      "@keyhive/keyhive",
      "@keyhive/keyhive/slim",
    ],
    // CommonJS dependencies of the excluded packages still need
    // pre-bundling for CJS-to-ESM interop.
    include: [
      "@automerge/automerge-repo > debug",
      "@automerge/automerge-repo > bs58check",
      "@automerge/automerge-repo > fast-sha256",
      "@automerge/automerge-repo > cbor-x",
      "@automerge/automerge-repo > eventemitter3",
      "@automerge/automerge-repo > uuid",
      "@automerge/automerge-repo > isomorphic-ws",
      "@automerge/automerge-repo > xstate",
    ],
  },

  plugins: [wasm(), react()],

  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
});
