import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
// The slim entry so loading this config does not initialize the Automerge WASM.
import { isValidAutomergeUrl } from "@automerge/automerge-repo/slim";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Where a package's files really live, following symlinks.
//
// During development some dependencies are `link:`ed to sibling checkouts, so
// their real files sit outside this project root. The dev server refuses to
// serve anything outside `server.fs.allow`, which breaks onomancy's Wasm fetch
// with "outside of Vite serving allow list" — a **dev-only** failure, because
// `vite build` copies assets into `dist/` rather than serving them from disk.
// So a production build stays green while the dev server cannot start the app,
// which is a confusing pair of symptoms for one cause.
//
// Derived rather than hardcoded: when a package is installed normally this
// resolves inside node_modules and is already allowed, so the entry is
// harmless and nothing has to be remembered when the links are reverted.
function packageRoots(specifiers: string[]): string[] {
  return specifiers.flatMap((specifier) => {
    let entry: string;
    try {
      entry = fileURLToPath(import.meta.resolve(specifier));
    } catch (error) {
      // Not installed at all. Nothing to allow, and nothing wrong.
      void error;
      return [];
    }

    // Walk up from the resolved entry to the directory holding its
    // package.json. Resolving `${specifier}/package.json` directly would be
    // shorter and does not work: an `exports` map without a "./package.json"
    // entry makes it unresolvable, which is exactly the case for
    // @inkandswitch/onomancy. That failure is silent and leaves the package
    // missing from the allow list, so the dev server 403s on its Wasm while
    // every other gate stays green.
    let dir = realpathSync(dirname(entry));
    for (;;) {
      if (existsSync(resolve(dir, "package.json"))) return [dir];
      const parent = dirname(dir);
      if (parent === dir) {
        // Should be unreachable: something resolved, so a manifest exists
        // above it. Loud rather than silent, because the symptom otherwise
        // appears only in dev and only as a 403 on one asset.
        throw new Error(
          `Could not find the package root for "${specifier}" above ${entry}`
        );
      }
      dir = parent;
    }
  });
}

// Force a single copy of the automerge and subduction modules, resolved from
// this project's node_modules. `automerge-repo-keyhive` brings its own copies,
// and a duplicate of a WASM-backed module is a separate module instance, which
// breaks wasm-bindgen instanceof checks ("expected instance of Topic/PeerId").
// pnpm-workspace.yaml pins the same packages at install time.
const automergeEntryDir = dirname(
  fileURLToPath(import.meta.resolve("@automerge/automerge"))
);
const subductionEsmDir = dirname(
  fileURLToPath(import.meta.resolve("@automerge/automerge-subduction"))
);
const repoEntryDir = dirname(
  fileURLToPath(import.meta.resolve("@automerge/automerge-repo"))
);

// The document id of the shared phonebook, which holds every peer's name and
// avatar. It is required rather than hardcoded so that each deployment of the
// demo has its own phonebook, shared only with the people it shares the id with.
// The phonebook is unencrypted and unprotected, so anyone who knows the id can
// read and write it.
//
// The id has to stay the same between runs: generating a fresh one points the
// app at a brand new, empty phonebook. So it is read from a .env file, which
// survives closing the terminal, and a shell variable can still override it for
// a one-off run.
function requirePhonebookDocId(env: Record<string, string>): string {
  const phonebookDocId = process.env.PHONEBOOK_DOC_ID || env.PHONEBOOK_DOC_ID;
  if (!phonebookDocId) {
    throw new Error(
      "PHONEBOOK_DOC_ID is required. Create one with:\n" +
        '  echo "PHONEBOOK_DOC_ID=$(pnpm -s gen:phonebook-id)" > .env\n' +
        "or pass it for a single run: PHONEBOOK_DOC_ID=automerge:... pnpm dev"
    );
  }
  if (
    !isValidAutomergeUrl(
      phonebookDocId.startsWith("automerge:")
        ? phonebookDocId
        : `automerge:${phonebookDocId}`
    )
  ) {
    throw new Error(
      `PHONEBOOK_DOC_ID is not a valid Automerge document id: "${phonebookDocId}". ` +
        "Generate one with `pnpm gen:phonebook-id`."
    );
  }
  return phonebookDocId;
}

export default defineConfig(({ mode }) => {
  // Read .env / .env.<mode>. The "" prefix loads every key, not just VITE_ ones,
  // because these are consumed here in the config rather than through
  // import.meta.env. A shell variable takes precedence over the file.
  const env = loadEnv(mode, process.cwd(), "");
  const phonebookDocId = requirePhonebookDocId(env);

  return {
    define: {
      // Sync server websocket endpoint. Defaults to the public keyhive sync
      // server. Override with SYNC_SERVER, e.g. SYNC_SERVER=ws://localhost:3030
      // for a local dev server.
      __SYNC_SERVER__: JSON.stringify(
        process.env.SYNC_SERVER ||
          env.SYNC_SERVER ||
          "wss://keyhive.sync.automerge.org"
      ),
      // Sync server identity: its signed contact card JSON and its keyhive peer
      // id. Both must be set together, and they must match the identity the
      // configured SYNC_SERVER actually runs. When left unset the demo uses the
      // built-in "keyhive" identity, which the public keyhive sync server and a
      // stock local subduction_cli dev server both run.
      __SYNC_SERVER_CONTACT_CARD__: JSON.stringify(
        process.env.SYNC_SERVER_CONTACT_CARD ||
          env.SYNC_SERVER_CONTACT_CARD ||
          ""
      ),
      __SYNC_SERVER_PEER_ID__: JSON.stringify(
        process.env.SYNC_SERVER_PEER_ID || env.SYNC_SERVER_PEER_ID || ""
      ),
      __PHONEBOOK_DOC_ID__: JSON.stringify(phonebookDocId),
    },
    base: "./",
    server: {
      port: 5557,
      open: true,
      fs: {
        allow: [
          process.cwd(),
          ...packageRoots([
            "@inkandswitch/onomancy",
            "@automerge/keyhive-react",
          ]),
        ],
      },
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
        // Onomancy needs excluding for a different reason than the packages
        // above. It is not duplicated anywhere, so nothing has to be collapsed
        // onto one instance and it needs no alias: every entry variant
        // re-exports the same web-target bindings, so the parallel class table
        // trap the subduction alias avoids cannot arise here. The browser
        // condition picks dist/esm/bundler.js, which loads the wasm through
        // `new URL("../onomancy.wasm", import.meta.url)`. Pre-bundling would
        // rewrite that module to a different directory and the relative URL
        // would go with it, so the wasm would 404.
        "@inkandswitch/onomancy",
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
  };
});
