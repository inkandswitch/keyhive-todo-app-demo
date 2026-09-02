// The second half of a DNS binding.
//
// DNS proves `hostname -> document`. That direction alone is worth little:
// anyone may point their own zone at someone else's document. The certificate
// is the document's side of the claim, and only the pair is a binding.
//
// The certificate lives in the document it binds, so a verifier that resolved
// a name has already replicated the evidence — there is no endpoint to fetch
// and nothing to keep in sync with the document.

import { useEffect, useState } from "react";
import type { AutomergeUrl, Repo } from "@automerge/react/slim";
import { verifyCertificate } from "@inkandswitch/onomancy";
import type { Verdict } from "@inkandswitch/onomancy";
import type { DnsDesignation } from "@automerge/keyhive-react/onomancy";
import {
  CERTIFICATES_KEY,
  RESERVED_ONOMANCY_KEY,
  certificatesOf,
} from "./namestore";
import type { NamestoreDoc } from "./namestore";
import { documentUrlFromHex } from "./onomancy";
import { log } from "./log";

/**
 * What a document's certificates say about a hostname's claim on it.
 *
 * Split by remedy, the same discipline the DNS status vocabulary uses. The
 * distinction that matters most is between the last two: `absent` is the
 * document making no claim, while `rejected` is evidence that arrived and
 * failed. Rendering those the same way would present a possible attack as a
 * missing feature.
 */
export type CertificateVerdict =
  | {
      status: "accepted";
      /** `on-path` proves the TXT generation key vouched for the signer. */
      generation: "on-path" | "provisional" | null;
      freshness: string;
      /** Decimal: the serial space is u64, which `number` cannot hold. */
      serial: string;
    }
  /** The document carries no certificate for this hostname. Not a failure. */
  | { status: "absent" }
  /** Evidence arrived and failed. A security signal. */
  | { status: "rejected"; reason: string };

/**
 * Refusals that mean "this certificate is about something else" rather than
 * "this certificate is bad".
 *
 * A document naming several hostnames carries several certificates. Reaching
 * one for another name while looking for this one is ordinary, so it must not
 * poison the result — only exhausting every candidate is an absence.
 */
const NOT_ABOUT_THIS_NAME = new Set([
  "hostname-mismatch",
  "no-certificate-held",
]);

/**
 * Whether two anchors name the same document.
 *
 * Compared as strings after normalising the `automerge:` prefix, which the
 * verdict may or may not carry. Not parsed into ids: a mismatch here is a
 * refusal either way, and parsing would add a failure mode to a comparison
 * that does not need one.
 */
function sameDocument(a: string, b: string): boolean {
  const bare = (value: string) => value.replace(/^automerge:/, "");
  return bare(a) === bare(b);
}

function refusalReason(error: unknown): string {
  // The module marks evidence refusals with `reason`; argument errors have
  // none. `"reason" in error` is the documented way to tell a verdict about
  // evidence from a failure to form one.
  if (typeof error === "object" && error !== null && "reason" in error) {
    return String((error as { reason: unknown }).reason);
  }
  return "decode";
}

/**
 * Whether a verdict is strong enough to call the binding mutual.
 *
 * **Strictness rises with freshness, which is the opposite of the intuition.**
 * A fresh chain is authoritative enough to convict, so a fresh chain whose
 * generation key is off-path is refused outright by the verifier and never
 * reaches here. A stale chain carrying the same condition grades
 * `provisional` instead, because stale evidence is unrefreshed rather than
 * authoritative — it is not proof of wrongdoing.
 *
 * Written as a table rather than a condition on purpose. `if (fresh) accept`
 * reads perfectly naturally and is backwards, and a conditional invites
 * exactly that shape.
 */
export function isMutual(verdict: CertificateVerdict): boolean {
  if (verdict.status !== "accepted") return false;
  switch (verdict.generation) {
    // The generation key vouched for the signer: the strongest statement the
    // format makes.
    case "on-path":
      return true;
    // Off-path under a stale chain. The verifier declined to convict on
    // unrefreshed evidence, and so do we: not proven, not disproven.
    case "provisional":
      return false;
    // No generation claim to check. Absent is not a failed check, but it is
    // also not a passed one.
    default:
      return false;
  }
}

/**
 * Verify what `url` claims about `hostname`.
 *
 * Every certificate the document holds is tried, and the first that verifies
 * wins. Refusals meaning "for another name" are stepped over; any other
 * refusal is reported, because it is evidence that arrived and failed.
 */
export async function verifyDocumentClaim(
  repo: Repo,
  url: AutomergeUrl,
  hostname: string
): Promise<CertificateVerdict> {
  const held = await certificatesOf(repo, url);
  if (held.length === 0) return { status: "absent" };

  let rejection: string | null = null;

  for (const bytes of held) {
    try {
      const verdict = verifyCertificate(bytes, hostname);

      // The certificate must name the document it was found in.
      //
      // `verifyCertificate` takes bytes and a hostname; it cannot know where
      // they came from, so it will happily validate a certificate for some
      // OTHER document. And certificates are self-authenticating and meant to
      // be gossiped — obtaining a valid one is not an attack, it is the design.
      // So without this check, planting a borrowed certificate in a document
      // you control earns that document a mutual binding it never had.
      if (!sameDocument(verdict.document, url)) {
        log.debug(
          `onomancy: ${url} holds a certificate for ${verdict.document} — ` +
            `valid, but not about this document`
        );
        continue;
      }

      return {
        status: "accepted",
        generation: verdict.generation,
        freshness: String(verdict.freshness),
        serial: String(verdict.serial),
      };
    } catch (error) {
      const reason = refusalReason(error);
      if (NOT_ABOUT_THIS_NAME.has(reason)) continue;
      // Keep the first real refusal. A later certificate may still verify, in
      // which case acceptance wins — but if none does, this is the honest
      // reason rather than a bare absence.
      rejection ??= reason;
      log.debug(`onomancy: certificate refused for ${hostname}: ${reason}`);
    }
  }

  return rejection === null
    ? { status: "absent" }
    : { status: "rejected", reason: rejection };
}

/** One line a reader can act on, per verdict. */
export function describeClaim(
  verdict: CertificateVerdict,
  hostname: string
): string {
  switch (verdict.status) {
    case "accepted":
      return isMutual(verdict)
        ? `This document accepts ${hostname}: its certificate is signed by a key the domain's generation key vouches for.`
        : `This document carries a certificate for ${hostname}, but on evidence too weak to rely on (generation ${verdict.generation ?? "unstated"}, chain ${verdict.freshness}). Not disproven — unrefreshed.`;
    case "absent":
      return `Resolved through DNS. This document makes no claim on ${hostname}, so nothing here shows it accepts the name.`;
    case "rejected":
      return `Resolved through DNS, but this document's certificate for ${hostname} failed verification (${verdict.reason}). Evidence arrived and did not hold.`;
  }
}

/**
 * Verify a resolved `@host` name's certificate, as a hook.
 *
 * Keyed on the *root* document and the hostname, never on the resolved
 * target: the certificate lives in the document DNS designates, and the
 * document a walk ends at has no claim on the name.
 *
 * Starts at `pending` and never renders a claim it has not checked — the
 * absence of a verdict is not the same as a negative one, which is the same
 * discipline the DNS statuses use.
 */
export function useDocumentClaim(
  repo: Repo,
  root: AutomergeUrl | null,
  hostname: string | null
): CertificateVerdict | { status: "pending" } {
  const [verdict, setVerdict] = useState<
    CertificateVerdict | { status: "pending" }
  >({ status: "pending" });

  useEffect(() => {
    if (!root || !hostname) return;
    let cancelled = false;
    setVerdict({ status: "pending" });

    verifyDocumentClaim(repo, root, hostname)
      .then((result) => {
        if (!cancelled) setVerdict(result);
      })
      .catch((error: unknown) => {
        // A throw here is a failure to form a verdict, not a verdict. Report
        // it as an absence rather than a rejection: claiming evidence failed
        // when none was read would be the wrong-remedy bug one level up.
        log.debug(`onomancy: claim check threw for ${hostname}:`, error);
        if (!cancelled) setVerdict({ status: "absent" });
      });

    return () => {
      cancelled = true;
    };
  }, [repo, root, hostname]);

  return verdict;
}

/**
 * A designation that requires the **reverse binding**, not just the forward one.
 *
 * The DNS record proves `hostname -> document`. On its own that is a claim the
 * domain makes unilaterally: any zone may name any document id, and the
 * document's admins cannot decline. The onomancy certificate held *in* that
 * document is the other direction — the document, through an admin key,
 * asserting the hostname. The spec is explicit that a verified binding needs
 * both (`dns-anchor.md`, "A verified DNS binding proves exactly this"), and a
 * conforming verifier refuses with `no-certificate-held` when the reverse half
 * is absent.
 *
 * `createKeyhiveDesignation` alone checks only that the identity administers
 * the designated document. That is necessary and not sufficient: it shows the
 * identity *could have* signed a certificate, never that one exists. Reporting
 * `verified` on it is not a weaker claim than the spec's — it is a different
 * one, and the glyph does not distinguish them.
 *
 * So this composes the two and takes the weaker verdict:
 *
 * | keyhive says | certificate | result |
 * | --- | --- | --- |
 * | designates | accepted, mutual | **designates** |
 * | designates | absent | `unknown` — not proven, not disproven |
 * | designates | rejected | `excludes` — evidence arrived and failed |
 * | anything else | — | unchanged |
 *
 * Absence maps to `unknown` rather than `excludes` deliberately. A document
 * that carries no certificate has not *denied* the domain; it has said
 * nothing, and absence of evidence is not evidence of absence. A certificate
 * that arrived and failed verification is different in kind, and that one does
 * convict.
 *
 * One consequence: `createKeyhiveDesignation` short-circuits when a bound id
 * *is* the identity, and wrapping it makes that case `unknown` — a bare key
 * holds no certificate. That is correct; `p=` names a document. See ADR-031.
 */
export function requireReverseBinding(
  repo: Repo,
  inner: DnsDesignation
): DnsDesignation {
  return async (entry, boundIds, hostname) => {
    const forward = await inner(entry, boundIds, hostname);
    if (forward !== "designates") return forward;

    // Every document the domain designates gets a chance: a domain mid-
    // migration publishes several, and only one need carry the certificate.
    let sawRejection = false;
    for (const id of boundIds) {
      const url = documentUrlFromHex(id);
      if (!url) continue;
      const claim = await verifyDocumentClaim(repo, url, hostname);
      if (claim.status === "accepted" && isMutual(claim)) return "designates";
      if (claim.status === "rejected") sawRejection = true;
    }

    log.debug(
      `onomancy: ${hostname} designates a document ${entry.id.slice(0, 8)} ` +
        `administers, but no certificate ${sawRejection ? "verified" : "was held"}`
    );
    return sawRejection ? "excludes" : "unknown";
  };
}

/** What happened when a certificate was offered to a document. */
export type InstallResult =
  | { status: "installed"; hostname: string; replaced: boolean; bytes: number }
  | { status: "refused"; reason: string };

/**
 * Verify a certificate and, if it holds, write it into `url`.
 *
 * The verification is not a formality. `verifyCertificate` is handed raw bytes
 * and a hostname, so it cannot know which document those bytes were about to
 * be filed in — and a certificate that is perfectly valid for document A says
 * nothing about document B. Checking the verdict's document against the write
 * target here is the same guard the reader applies, moved earlier: refusing to
 * store a mismatched certificate is better than storing one and declining to
 * believe it, because only the first leaves the document honest.
 *
 * Certificates are a list because a document naming several hostnames carries
 * several. So this replaces any existing entry for the same hostname and
 * leaves the others alone: installing `@a.com` must not silently drop the
 * certificate for `@b.com`.
 */
export async function installCertificate(
  repo: Repo,
  url: AutomergeUrl,
  hostname: string,
  bytes: Uint8Array
): Promise<InstallResult> {
  let verdict: Verdict;
  try {
    verdict = verifyCertificate(bytes, hostname);
  } catch (error) {
    return {
      status: "refused",
      reason:
        `This certificate does not verify for ${hostname} ` +
        `(${refusalReason(error)}). Nothing was written.`,
    };
  }

  if (!sameDocument(verdict.document, url)) {
    return {
      status: "refused",
      reason:
        `This certificate is about ${verdict.document}, not this document. ` +
        `It may be perfectly valid — it is simply not about what you are ` +
        `filing it in, and storing it here would not make it so.`,
    };
  }

  // A stale certificate is still the right certificate; refusing it here would
  // hide the one thing its holder needs to see, which is that it expired.
  // The badge grades freshness separately and says so.
  let replaced = false;
  const handle = await repo.find<NamestoreDoc>(url);
  handle.change((doc) => {
    // Assign then re-read: `??=` yields the plain object, not the proxy.
    if (!doc[RESERVED_ONOMANCY_KEY]) doc[RESERVED_ONOMANCY_KEY] = {};
    const map = doc[RESERVED_ONOMANCY_KEY] as Record<string, unknown>;
    if (!map) return;

    const held = Array.isArray(map[CERTIFICATES_KEY])
      ? (map[CERTIFICATES_KEY] as Uint8Array[])
      : [];

    const kept = held.filter((entry) => {
      if (!(entry instanceof Uint8Array)) return false;
      try {
        // Same hostname means this one supersedes it.
        const existing = verifyCertificate(entry, hostname);
        if (existing.hostname === verdict.hostname) {
          replaced = true;
          return false;
        }
      } catch {
        // Unreadable, or for another hostname. Either way not ours to drop:
        // a certificate we cannot parse may still be one another client can.
      }
      return true;
    });

    map[CERTIFICATES_KEY] = [...kept, bytes];
  });

  log.info(
    `Installed a ${bytes.length}-byte certificate for ${verdict.hostname} ` +
      `into ${url}${replaced ? " (replacing an earlier one)" : ""}`
  );
  return {
    status: "installed",
    hostname: verdict.hostname,
    replaced,
    bytes: bytes.length,
  };
}
