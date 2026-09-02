// The authority carriage: the proof that a signer may speak for a document.
//
// A certificate carries its authority as opaque `Signed<Delegation>` units,
// doc root to signer. When keyhive is the authority those bytes are a version
// tag plus one bincode-encoded `StaticEvent` each, which is exactly what
// `JsEvent.toBytes()` produces — so building a carriage is a filter over
// events keyhive already holds, not a minting step.
//
// UNEXERCISED: no certificate built from this has been accepted by a verifier.

import type { AutomergeUrl } from "@automerge/react/slim";
import {
  docIdFromAutomergeUrl,
  type AutomergeRepoKeyhive,
} from "@automerge/automerge-repo-keyhive";
import { log } from "./log";

/** One serialized `StaticEvent`, as a carriage entry. */
export type CarriageEntry = Uint8Array;

export interface Carriage {
  entries: CarriageEntry[];
  /** Delegations naming this document as their subject. */
  delegations: number;
  /** Prekey operations, which introduce keys a delegation names. */
  introductions: number;
  totalBytes: number;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The carriage proving this identity may sign for `docUrl`.
 *
 * Two kinds of entry, both required:
 *
 * - **Delegations** naming the document as subject. `membershipOpsForAgent`
 *   is scoped to the agent, so it spans every document that agent has touched;
 *   filtering on `subjectId` is what makes it document-scoped.
 * - **Introductions** — prekey ops. Keyhive resolves a delegation's delegate
 *   against known individuals, so a chain naming a key it has never been
 *   introduced to cannot ingest.
 *
 * A superset is safe: the verifier replays to a fixpoint and fails only on an
 * entry that never ingests, so a spare prekey op costs 140 bytes while a
 * missing one costs the whole proof with no indication which entry was to
 * blame.
 *
 * It does not stay cheap. `agent.keyOps()` grows with the identity's age
 * rather than with the document, while the delegations for one document stay
 * at two. If it needs trimming, take prekey ops only for keys named in the
 * selected delegations. Not done yet: trimming too far fails the same opaque
 * way as every other carriage defect, so it is unsafe until a failed replay
 * can report which entry never ingested.
 *
 * ## The signer is this identity, never the document's owner group
 *
 * A fresh `repo.create2` document has two direct Admins: this identity, and a
 * generated owner group that keyhive-react filters out of member lists. The
 * group looks like the truer owner and **cannot sign** — `Group::generate`
 * mints its key inside `EphemeralSigner::with_signer` and forgets it, so
 * `JsGroup` exposes no signing surface. Same mechanism as ADR-023.
 *
 * Any *direct* admin may sign, so a co-owner invited through the share modal
 * can mint certificates for the same name. Admin held through a group cannot:
 * `sanctioned` reads `members()`, which is direct-only. Invite namestore
 * co-owners directly, or they can write names and not certify them.
 */
export async function carriageFor(
  hive: AutomergeRepoKeyhive,
  docUrl: AutomergeUrl
): Promise<Carriage> {
  const docId = hex(docIdFromAutomergeUrl(docUrl).toBytes());
  const individual = hive.active.individual;
  const agent = individual.toAgent();

  const entries: CarriageEntry[] = [];
  let delegations = 0;
  let introductions = 0;

  const ops = await hive.keyhive.membershipOpsForAgent(agent);
  for (const op of ops.values()) {
    const signed = op.tryIntoSignedDelegation?.();
    if (!signed) continue;
    // `subjectId` is the document the delegation is about. Comparing it is
    // what makes an agent-scoped set document-scoped, and it needs no bincode
    // decoding — the wrapper exposes it directly.
    if (hex(signed.subjectId.toBytes()) !== docId) continue;
    entries.push(op.toBytes());
    delegations += 1;
  }

  const keyOps = await agent.keyOps();
  for (const bytes of keyOps.values()) {
    if (bytes instanceof Uint8Array) {
      entries.push(bytes);
      introductions += 1;
    }
  }

  const totalBytes = entries.reduce((sum, e) => sum + e.length, 0);
  log.debug(
    `onomancy: carriage for ${docUrl} — ${delegations} delegation(s), ` +
      `${introductions} introduction(s), ${totalBytes} bytes`
  );

  if (delegations === 0) {
    // Not thrown: an empty carriage is a real state for a document this
    // identity has no delegation on, and the caller decides whether that is
    // an error. But it will never verify, so it should never be silent.
    log.warn(
      `onomancy: no delegation naming ${docUrl} — this identity cannot sign for it`
    );
  }

  return { entries, delegations, introductions, totalBytes };
}
