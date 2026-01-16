// vite.standalone.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  define: {
    __SYNC_SERVER__: JSON.stringify(process.env.SYNC_SERVER || "ws://localhost:3030"),
  },
  base: "./",
  server: {
    port: 5557,
    open: "/standalone.html", // Open standalone.html by default
    watch: {
      ignored: ["!**/node_modules/@automerge/automerge-repo-keyhive/**"],
    },
  },

  build: {
    sourcemap: "inline",
    target: "esnext",
    assetsInlineLimit: 100000,
    rollupOptions: {
      input: "./standalone.html",
    },
  },

  plugins: [wasm(), react()],

  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
});
