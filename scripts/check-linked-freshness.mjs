// Are the linked dependencies' build artifacts newer than their sources?
//
// `readlink -f node_modules/<pkg>` answers *what runs here* rather than *what
// exists somewhere*, which is the check that catches reading a sibling tree
// nothing resolves. But it is not sufficient for a linked package that ships a
// build artifact.
//
// Every package here resolves through `main`/`module` to `dist/`, not `src/`.
// So a live link stays live-looking while the bytes being executed drift
// behind the source someone is reading and editing. `readlink` reports the
// link the whole time and cannot see the gap.
//
// This happened during a cross-session integration: a `cargo fmt` import
// reorder landed after the last Wasm build, so upstream's source and the bytes
// running in this browser had genuinely diverged. It was a semantic no-op that
// time. The divergence was real, invisible from here, and would have been
// indistinguishable from a substantive change.
//
// Both artifacts that answer "what runs" are the ones that do not look
// authoritative: the stalest-looking version string can belong to the live
// tree, and `dist/` carries a plausible recent mtime whether or not it matches
// `src/`.
//
//   node scripts/check-linked-freshness.mjs
//
// Exits non-zero when anything is stale, so it can gate an integration run.

import { execFileSync } from "node:child_process";
import { readdirSync, readlinkSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MODULES = join(ROOT, "node_modules");
const SOURCE_EXTENSIONS = [".rs", ".ts", ".tsx", ".js", ".jsx"];
const ARTIFACT_EXTENSIONS = [".js", ".mjs", ".cjs", ".wasm", ".d.ts"];

/** Symlinked packages whose target lies outside this project. */
function linkedPackages() {
  const found = [];

  const consider = (name, path) => {
    let target;
    try {
      if (!statSync(path, { throwIfNoEntry: false })) return;
      target = resolve(join(path, ".."), readlinkSync(path));
    } catch {
      return; // Not a symlink, or unreadable. Neither is interesting.
    }
    // Links into `.pnpm/` are the store's own indirection, not a live tree.
    if (target.includes("/.pnpm/") || target.startsWith(ROOT + "/node_modules"))
      return;
    found.push({ name, target });
  };

  for (const entry of readdirSync(MODULES)) {
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(join(MODULES, entry))) {
        consider(`${entry}/${scoped}`, join(MODULES, entry, scoped));
      }
    } else {
      consider(entry, join(MODULES, entry));
    }
  }
  return found;
}

/** Newest mtime among files under `dir` with one of `extensions`. */
function newestFile(dir, extensions) {
  let out;
  try {
    const listed = execFileSync(
      "find",
      [dir, "-type", "f", "-printf", "%T@ %p\n"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    for (const line of listed.split("\n")) {
      if (!line) continue;
      const at = line.indexOf(" ");
      const path = line.slice(at + 1);
      if (!extensions.some((extension) => path.endsWith(extension))) continue;
      const time = Number(line.slice(0, at));
      if (!out || time > out.time) out = { time, path };
    }
  } catch {
    return undefined; // No such directory. Reported as unknown, not as stale.
  }
  return out;
}

let stale = 0;
let checked = 0;

for (const { name, target } of linkedPackages()) {
  const artifact = newestFile(join(target, "dist"), ARTIFACT_EXTENSIONS);
  const source = newestFile(join(target, "src"), SOURCE_EXTENSIONS);

  // No dist means the package is consumed from source, so there is nothing to
  // drift. No src means we cannot tell, and saying so beats implying freshness.
  if (!artifact || !source) {
    console.log(`  ${name}\n      consumed from source or unbuildable here`);
    continue;
  }

  checked += 1;
  const behindBy = source.time - artifact.time;
  if (behindBy > 0) {
    stale += 1;
    console.log(
      `  STALE  ${name}\n` +
        `      running bytes are ${Math.round(behindBy)}s older than its source\n` +
        `      newest source:   ${source.path.replace(target + "/", "")}\n` +
        `      newest artifact: ${artifact.path.replace(target + "/", "")}`
    );
  } else {
    console.log(
      `  ok     ${name}  ->  ${target.replace(process.env.HOME ?? "", "~")}`
    );
  }
}

if (stale > 0) {
  console.error(
    `\n${stale} of ${checked} linked packages are running bytes older than ` +
      `their source. Rebuild upstream before trusting an integration result: ` +
      `what you read is not what executes.`
  );
  process.exit(1);
}

console.log(`\n${checked} linked packages current.`);
