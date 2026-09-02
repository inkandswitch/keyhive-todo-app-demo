import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts rather than merged with it.
//
// The app's config requires PHONEBOOK_DOC_ID and throws without it, which is
// right for a build and wrong for a test run: nothing under test needs a
// phonebook, or a sync server, or the Wasm aliasing. Keeping the two apart
// means `pnpm test` works on a fresh clone with no .env at all.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
