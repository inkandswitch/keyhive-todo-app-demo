// A profile pointer must not let one identity speak as another.
//
// Display names live in a shared unprotected phonebook that anyone holding the
// id can rewrite, so a name there is self-asserted. Self-published profiles fix
// that by living in a document only their subject can write — but finding one
// means following a pointer, and the pointer is in the same forgeable map.
//
// What makes it safe is that a forged pointer is *detectable* where a forged
// name is not: the profile document is keyhive-owned, so its members are
// checkable. An identity that does not reach the document it claims does not
// get to speak through it.
//
//   node e2e/profile-verification.mjs
//
// Exits non-zero on any failure.

import { probe } from "./harness.mjs";

const results = await probe("profile-verify", async () => {
  const prof = await import("/src/profile.ts");
  const out = {};
  const key = Object.keys(localStorage).find(
    (k) => k.startsWith("keyhive-demo-namestore-") && !k.includes("origin")
  );
  const namestore = key ? localStorage.getItem(key) : null;
  if (!namestore) return { error: "no namestore" };

  const self = [...window.hive.active.individual.id.toBytes()]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await prof.publishProfile(window.repo, namestore, { name: "Honest Name" });
  const honest = await prof.verifyProfile(
    window.repo,
    window.hive,
    self,
    namestore
  );
  out.honest = { status: honest.status, name: honest.profile?.name };

  // A pointer from somebody else's identity at a document they do not reach.
  const attacker = await window.repo.create2({ onomancy: {} });
  await prof.publishProfile(window.repo, attacker.url, { name: "Pwned" });
  const forged = await prof.verifyProfile(
    window.repo,
    window.hive,
    "cc".repeat(32),
    attacker.url
  );
  out.forged = { status: forged.status, name: forged.profile?.name };

  const absent = await prof.verifyProfile(
    window.repo,
    window.hive,
    self,
    "automerge:2nuSYdXmDNwcZG61XBXVQqjs5z1ExPDYZTsYVm9toa5Qh5iu5V"
  );
  out.unreachable = { status: absent.status };
  return out;
});

const failures = [];
const expect = (name, actual, wanted) => {
  if (actual !== wanted)
    failures.push(`${name}: expected ${wanted}, got ${actual}`);
};

expect(
  "a profile in the identity's own document verifies",
  results.honest?.status,
  "verified"
);
expect("that profile's name is returned", results.honest?.name, "Honest Name");
// Requires the transitive delegation walk. Before it, a non-member graded
// `unknown` and this was `unknown` too — safe, but it convicted nothing.
expect(
  "a pointer at a document the identity does not reach is convicted",
  results.forged?.status,
  "impostor"
);
expect(
  "the forged profile's name is NOT returned",
  results.forged?.name,
  undefined
);
expect(
  "an unreplicated document says nothing either way",
  results.unreachable?.status,
  "unknown"
);

if (failures.length) {
  console.error("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("\nAll profile verification invariants hold.");
