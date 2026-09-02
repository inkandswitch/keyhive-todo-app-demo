import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const automergeSlimImportRule = {
  meta: {
    name: "enforce-automerge-slim-import",
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        let isAutomergeProblem = false;
        if (node.source.value === "@automerge/automerge") {
          isAutomergeProblem = true;
        } else if (
          node.source.value.startsWith("@automerge/automerge/") &&
          !node.source.value.startsWith("@automerge/automerge/slim")
        ) {
          isAutomergeProblem = true;
        }
        if (isAutomergeProblem) {
          context.report({
            node,
            message:
              "Import from @automerge/automerge/slim instead of @automerge/automerge",
          });
        }

        let isAutomergeRepoProblem = false;
        if (node.source.value === "@automerge/automerge-repo") {
          isAutomergeRepoProblem = true;
        } else if (
          node.source.value.startsWith("@automerge/automerge-repo/") &&
          !node.source.value.startsWith("@automerge/automerge-repo/slim")
        ) {
          isAutomergeRepoProblem = true;
        }
        if (isAutomergeRepoProblem) {
          context.report({
            node,
            message:
              "Import from @automerge/automerge-repo/slim instead of @automerge/automerge-repo",
          });
        }
      },
    };
  },
};

export default [
  {
    ignores: [
      "**/*.d.ts",
      "**/*.config.ts",
      "**/*.config.js",
      "**/dist/*",
      "**/node_modules/*",
      "eslint.config.mjs",
      // Throwaway drivers used to verify the onomancy path by hand: hardcoded
      // paths, a live DNS record, node-only globals. Scratch rather than
      // source, and tracked in .ignore/TODO.md as promote-or-delete. Ignored
      // so `pnpm lint` reports on the app rather than on the scaffolding.
      "*.tmp.mjs",
      ".ignore/*",
    ],
  },
  js.configs.recommended,
  ...compat.extends(
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],

    plugins: {
      "@typescript-eslint": typescriptEslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "automerge-slimport": {
        rules: {
          "enforce-automerge-slim-import": automergeSlimImportRule,
        },
      },
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
      },
    },

    rules: {
      "@typescript-eslint/no-floating-promises": 2,
      "@typescript-eslint/no-empty-function": 0,
      "@typescript-eslint/no-non-null-assertion": 0,
      "@typescript-eslint/no-explicit-any": 0,

      "@typescript-eslint/no-unused-vars": [
        2,
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "automerge-slimport/enforce-automerge-slim-import": 2,

      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        1,
        { allowConstantExport: true },
      ],
    },
  },
  {
    // e2e drivers are Node scripts whose `probe(...)` callbacks are serialised and
    // evaluated in the page, so one file legitimately spans both realms:
    // `chromium` and `process` at the top level, `window` and `crypto` inside
    // the callback. Nothing distinguishes them syntactically, so both sets of
    // globals are allowed here rather than sprinkling directives.
    files: ["e2e/**/*.mjs"],

    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["scripts/**/*.mjs"],

    plugins: {
      "automerge-slimport": {
        rules: {
          "enforce-automerge-slim-import": automergeSlimImportRule,
        },
      },
    },

    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: "latest",
      sourceType: "module",
    },

    rules: {
      "automerge-slimport/enforce-automerge-slim-import": 2,
    },
  },
];
