// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  server: {
    port: 5557,
    watch: {
      ignored: ['!**/node_modules/@automerge/automerge-keyhive-network-adapter/**']
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
