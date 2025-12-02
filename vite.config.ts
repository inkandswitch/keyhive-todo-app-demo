// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

export default defineConfig({
  base: "./",
  server: {
    port: 5557,
    watch: {
      ignored: ["!**/node_modules/@automerge/automerge-repo-keyhive/**"],
    },
  },

  build: {
    sourcemap: "inline",
    target: "esnext",
    assetsInlineLimit: 100000, // Inline assets smaller than 100kb as base64
    rollupOptions: {
      external: ["@automerge/automerge-repo-keyhive"],
      input: "./src/main.tsx",
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
      preserveEntrySignatures: "strict",
    },
  },

  plugins: [wasm(), react(), cssInjectedByJsPlugin()],

  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
});
