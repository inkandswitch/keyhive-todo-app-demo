# End-to-end invariants

Two security properties that would regress silently, encoded as tests that
**exit non-zero** when they break. Both need the dev server running.

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1   # another shell
node e2e/certificate-install.mjs
node e2e/profile-verification.mjs
```

They share `probes/harness.mjs`. See `probes/README.md` for the environment
variables and for the distinction: probes ask _what does the running code do_,
these assert _what must stay true_.

## What they cover

**`certificate-install.mjs`** — a certificate valid for document A must not be
installable into document B. `verifyCertificate` takes bytes and a hostname, so
it cannot know where they are being filed; without the check, a valid-looking
certificate could sit in a document that never accepted the name.

**`profile-verification.mjs`** — a profile pointer must not let one identity
speak as another. Display names are self-asserted and forgeable; what makes the
self-published version safe is that a forged _pointer_ is detectable where a
forged _name_ is not.

## Both were verified to fail

A test that has only ever passed has not been shown to test anything. Each was
checked by disabling the guard it covers and confirming it goes red:

    certificate-install   "expected refused, got installed"
    profile-verification  "expected impostor, got unknown"

Do that again if either is ever modified.

> [!WARNING]
> Disable a guard with something esbuild cannot constant-fold. A first attempt
> using `if (false && …)` left the test passing, and the served module showed
> the condition had been folded away — so the guard was gone and the test did
> not notice. Whether that was the fold or a stale transform was never
> established. `&& x === "NEVER"` is not foldable and behaved correctly.
