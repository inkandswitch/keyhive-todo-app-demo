// A certificate must not be installable into a document it is not about.
//
// `verifyCertificate` is handed raw bytes and a hostname, so it cannot know
// which document those bytes were about to be filed in. A certificate that is
// perfectly valid for document A says nothing about document B, and without
// this check the app would happily store it there — where a later reader,
// applying the same check on the way out, would find a valid-looking
// certificate in a document that never accepted the name.
//
// This has regressed once, in the read path. Encoding it here makes the next
// one loud.
//
//   node e2e/certificate-install.mjs
//
// Exits non-zero on any failure.

import { probe } from "./harness.mjs";

// Declared inside the callback rather than here: it is serialised and
// evaluated in the page, so it cannot close over module scope.
const results = await probe("cert-install", async () => {
  const { installCertificate } = await import("/src/certificate.ts");
  const { seedOnotest } = await import("/src/devFixtures.ts");
  const HOST = "onotest.brooklynzelenka.com";
  const DOC = "automerge:2nuSYdXmDNwcZG61XBXVQqjs5z1ExPDYZTsYVm9toa5Qh5iu5V";

  await seedOnotest(window.repo, DOC);
  const bytes = new Uint8Array(
    await (
      await fetch("/fixtures/onotest.brooklynzelenka.com.chained.onc")
    ).arrayBuffer()
  );

  const out = { fixtureBytes: bytes.length };
  out.correctDocument = await installCertificate(window.repo, DOC, HOST, bytes);

  // The security property: valid certificate, wrong document.
  const elsewhere = await window.repo.create2({ onomancy: {} });
  out.wrongDocument = await installCertificate(
    window.repo,
    elsewhere.url,
    HOST,
    bytes
  );

  out.wrongHostname = await installCertificate(
    window.repo,
    DOC,
    "example.com",
    bytes
  );

  await installCertificate(window.repo, DOC, HOST, bytes);
  const held = (await window.repo.find(DOC)).doc()?.onomancy?.[
    ".well-known/onomancy/certificates"
  ];
  out.storedAfterReinstall = held?.length;
  return out;
});

const failures = [];
const expect = (name, actual, wanted) => {
  if (actual !== wanted)
    failures.push(`${name}: expected ${wanted}, got ${actual}`);
};

expect(
  "a certificate for this document installs",
  results.correctDocument.status,
  "installed"
);
expect(
  "a certificate for ANOTHER document is refused",
  results.wrongDocument.status,
  "refused"
);
expect(
  "a certificate for another hostname is refused",
  results.wrongHostname.status,
  "refused"
);
expect(
  "re-installing replaces rather than accumulating",
  results.storedAfterReinstall,
  1
);

if (failures.length) {
  console.error("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("\nAll certificate install invariants hold.");
