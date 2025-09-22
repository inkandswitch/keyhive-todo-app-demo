// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

export default defineConfig({
  // customize this to your repo name for github pages deploy
  // base: "/keyhive-demo/",

  // FIXME: For local dev. Remove
  server: {
    port: 5557,
    fs: {
      allow: [
        // Search up for workspace root
        '.',
        // Allow serving files from the keyhive WASM directory
        '/Users/jtfmumm/dev/keyhive'
      ]
    },
    watch: {
      ignored: ['!**/node_modules/@automerge/automerge-keyhive-network-adapter/**']
    }
  },

  resolve: {
    alias: {
      "@keyhive/wasm": path.resolve(__dirname, "../keyhive/keyhive_wasm")
    }
  },

  build: {
    target: "esnext",
  },

  plugins: [wasm(), react()],

  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
});
