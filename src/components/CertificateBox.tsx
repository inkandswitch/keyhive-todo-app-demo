// Install a certificate into a document, by hand.
//
// The DNS record is only half a binding. The other half is a certificate held
// *in* the named document, and until minting works in the browser there is no
// way to put one there except from a file. `seedOnotest` has done exactly this
// from the console since the fixture existed; this is the same operation with
// somewhere to click.
//
// It stays useful after minting lands. A certificate can be lost by editing
// the wrong document, superseded by a re-issued one, or need moving between
// documents during a migration — and none of those are exotic enough to
// deserve a console-only remedy.

import { useRef, useState } from "react";
import type { AutomergeUrl, Repo } from "@automerge/react/slim";
import { isValidAutomergeUrl } from "@automerge/react/slim";
import type { AutomergeRepoKeyhive } from "@automerge/automerge-repo-keyhive";
import { installCertificate, type InstallResult } from "../certificate";
import { attemptMint, type MintOutcome } from "../mint";

interface CertificateBoxProps {
  repo: Repo;
  hive: AutomergeRepoKeyhive;
  /** Where a certificate lands unless the operator says otherwise. */
  defaultTarget: AutomergeUrl | null;
}

/**
 * A hostname and a file, checked before anything is written.
 *
 * The target document is editable rather than fixed. Recovering a document
 * that is *not* your namestore is precisely the case this exists for, and a
 * form that assumed otherwise would fail exactly when it was needed.
 */
export function CertificateBox({
  repo,
  hive,
  defaultTarget,
}: CertificateBoxProps) {
  const [hostname, setHostname] = useState("");
  const [target, setTarget] = useState<string>(defaultTarget ?? "");
  const [result, setResult] = useState<InstallResult | null>(null);
  const [mint, setMint] = useState<MintOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Mint, then file the result immediately.
   *
   * A certificate that exists but is not in the document it binds is not
   * useful to anybody, and leaving the operator to save and re-upload it would
   * be ceremony for its own sake.
   */
  async function createAndInstall() {
    setBusy(true);
    setMint(null);
    setResult(null);
    try {
      const outcome = await attemptMint(
        hive,
        trimmedHost,
        trimmedTarget as AutomergeUrl
      );
      setMint(outcome);
      if (outcome.status === "minted") {
        setResult(
          await installCertificate(
            repo,
            trimmedTarget as AutomergeUrl,
            trimmedHost,
            outcome.certificate.bytes
          )
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const trimmedHost = hostname.trim();
  const trimmedTarget = target.trim();
  const targetLooksValid = isValidAutomergeUrl(trimmedTarget);
  const ready = trimmedHost.length > 0 && targetLooksValid && !busy;

  async function install(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setResult(
        await installCertificate(
          repo,
          trimmedTarget as AutomergeUrl,
          trimmedHost,
          bytes
        )
      );
    } catch (error) {
      setResult({
        status: "refused",
        reason: `Could not read that file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setBusy(false);
      // Clearing lets the same file be chosen twice, which matters when the
      // first attempt was refused for a reason the operator has since fixed.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="certificate-box">
      <h4>Install a certificate</h4>
      <p className="hint">
        The DNS record points a name at this document. The certificate is the
        document&rsquo;s side of that claim, and without it a name resolves but
        earns no badge. Both halves are needed.
      </p>

      <label>
        Hostname
        <input
          type="text"
          value={hostname}
          placeholder="example.com"
          aria-label="Hostname the certificate is for"
          onChange={(event) => setHostname(event.target.value)}
        />
      </label>

      <label>
        Document
        <input
          type="text"
          value={target}
          placeholder="automerge:…"
          aria-label="Document to install the certificate into"
          onChange={(event) => setTarget(event.target.value)}
        />
      </label>
      {trimmedTarget.length > 0 && !targetLooksValid && (
        <p className="warning">That is not an Automerge document id.</p>
      )}

      <div className="certificate-actions">
        <button
          type="button"
          disabled={!ready}
          onClick={() => void createAndInstall()}
        >
          Create certificate
        </button>
        <span className="or">or install one from a file:</span>
        <input
          ref={fileInput}
          type="file"
          accept=".onc,application/octet-stream"
          disabled={!ready}
          aria-label="Certificate file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void install(file);
          }}
        />
      </div>
      {!ready && !busy && (
        <p className="hint">Enter a hostname and a document id first.</p>
      )}
      {busy && <p className="hint">Working&hellip;</p>}

      {mint?.status === "failed" && (
        <p className="warning">
          Could not create a certificate.
          <br />
          <span className="detail">{mint.reason}</span>
        </p>
      )}

      {result?.status === "installed" && (
        <p className="success">
          Installed {result.bytes} bytes for {result.hostname}
          {result.replaced && ", replacing the certificate that was there"}.
          Resolve the name to see whether it now verifies.
        </p>
      )}
      {result?.status === "refused" && (
        <p className="warning">{result.reason}</p>
      )}
    </div>
  );
}
