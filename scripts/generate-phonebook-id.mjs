// Prints a fresh Automerge document id to use as PHONEBOOK_DOC_ID. The
// document does not exist yet: the demo seeds it on first run (see
// ensurePhonebook in src/phonebook.ts). Import from the slim entry so this runs
// in Node without initializing the Automerge WASM module.
import { generateAutomergeUrl } from "@automerge/automerge-repo/slim";

console.log(generateAutomergeUrl());
