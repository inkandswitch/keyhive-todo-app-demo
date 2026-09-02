// Mint an onomancy certificate for a document you administer.
//
// A certificate is the reverse half of a DNS binding. The zone's TXT record
// says "this hostname designates that document"; the certificate, held *in*
// that document, says "and I accept". Without it a name resolves but earns no
// badge, because a record alone proves only that somebody who controls DNS
// pointed at you, not that you agreed.
//
// Four ingredients:
//
//   1. signable bytes   what to sign, from the onomancy module
//   2. signature        over those bytes, verbatim
//   3. carriage         keyhive ops proving the signer administers the
//                       document, so a verifier can check it offline
//   4. chain            the validated DNSSEC chain, embedded so the
//                       certificate stands alone
//
// Three and four are what make a certificate self-contained: a verifier needs
// no keyhive sync and no DNS query to check one.

import type { AutomergeUrl } from "@automerge/react/slim";
import type { AutomergeRepoKeyhive } from "@automerge/automerge-repo-keyhive";
import {
  encodeCertificate,
  resolveHostname,
  signableBytes,
} from "@inkandswitch/onomancy";
import { carriageFor } from "./carriage";
import { log } from "./log";

/**
 * Produce a detached signature over exactly `bytes`.
 *
 * A function rather than a key, so the caller decides custody. Nothing here
 * needs the key material — `crypto.subtle.sign` accepts a non-extractable
 * `CryptoKey` handle — which leaves room for a hardware token or passkey, and
 * keeps working if ARK stops persisting the identity key in exportable form.
 *
 * The signature must cover `bytes` **verbatim**. A signer that frames or
 * hashes its input first produces a certificate that assembles and verifies
 * nowhere.
 */
export type SignBytes = (bytes: Uint8Array) => Promise<Uint8Array>;

export interface Signing {
  /** The verifying key the certificate will name as its signer. */
  verifyingKey: Uint8Array;
  sign: SignBytes;
}

/**
 * Sign as this identity, using the keypair ARK holds for it.
 *
 * The certificate's signer must be an agent the bound document delegates to,
 * and the carriage is what proves it. This identity is that agent, so its key
 * is the one the carriage vouches for.
 */
export async function signingAsSelf(
  hive: AutomergeRepoKeyhive
): Promise<Signing> {
  const keyPair = hive.active.keyPair;
  const verifyingKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  return {
    verifyingKey,
    sign: async (bytes) =>
      new Uint8Array(
        await crypto.subtle.sign(
          { name: "Ed25519" },
          keyPair.privateKey,
          bytes as BufferSource
        )
      ),
  };
}

export interface MintedCertificate {
  bytes: Uint8Array;
  hostname: string;
  document: AutomergeUrl;
  /** Unix seconds the certificate was issued at. */
  issuedAt: number;
  /** Sizes, because the byte budget is the thing most likely to surprise. */
  sizes: {
    carriageEntries: number;
    carriageBytes: number;
    chainBytes: number;
    signableBytes: number;
    certificateBytes: number;
  };
}

/**
 * Mint a certificate binding `hostname` to `docUrl`.
 *
 * A verifier accepts this only if the bound document delegates to the signer.
 * Minting for a hostname whose zone designates a document you have no
 * authority over produces a well-formed certificate that grades
 * `signer-not-authorized`, which is the design working rather than a fault.
 */
export async function mintCertificate(
  hive: AutomergeRepoKeyhive,
  hostname: string,
  docUrl: AutomergeUrl,
  signing?: Signing
): Promise<MintedCertificate> {
  const { verifyingKey, sign } = signing ?? (await signingAsSelf(hive));

  // The chain comes from resolution rather than a fresh query: the certificate
  // must embed the *validated* chain, and validation is what `resolveHostname`
  // already did.
  const resolution = await resolveHostname(hostname);
  if (!resolution.chain || resolution.chain.length === 0) {
    throw new Error(
      `No validated DNSSEC chain for ${hostname}, so a certificate would have ` +
        `nothing to stand on.`
    );
  }

  const carriage = await carriageFor(hive, docUrl);

  // Seconds, not milliseconds. Mixing them yields a certificate dated fifty
  // thousand years hence, which grades `stale` for a very long time.
  const issuedAt = Math.floor(Date.now() / 1000);

  const toSign = signableBytes(docUrl, verifyingKey, issuedAt, hostname);
  const signature = await sign(toSign);

  const bytes = encodeCertificate(
    docUrl,
    verifyingKey,
    issuedAt,
    hostname,
    signature,
    carriage.entries,
    resolution.chain
  );

  const sizes = {
    carriageEntries: carriage.entries.length,
    carriageBytes: carriage.totalBytes,
    chainBytes: resolution.chain.length,
    signableBytes: toSign.length,
    certificateBytes: bytes.length,
  };
  log.info(`Minted a certificate for ${hostname}:`, sizes);

  return { bytes, hostname, document: docUrl, issuedAt, sizes };
}

/** Minting attempted, with the failure classified rather than raw. */
export type MintOutcome =
  | { status: "minted"; certificate: MintedCertificate }
  | { status: "failed"; reason: string };

/** Mint, converting a throw into a value the UI can render. */
export async function attemptMint(
  hive: AutomergeRepoKeyhive,
  hostname: string,
  docUrl: AutomergeUrl,
  signing?: Signing
): Promise<MintOutcome> {
  try {
    return {
      status: "minted",
      certificate: await mintCertificate(hive, hostname, docUrl, signing),
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
