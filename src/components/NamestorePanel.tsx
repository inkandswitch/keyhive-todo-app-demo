import { useMemo } from "react";
import { useRepo } from "@automerge/react";
import { AutomergeUrl } from "@automerge/react/slim";
import {
  AutomergeRepoKeyhive,
  uint8ArrayToHex,
} from "@automerge/automerge-repo-keyhive";
import {
  AccessEditor,
  CopyableField,
  createDocumentTarget,
} from "@automerge/keyhive-react";
import { keyhiveRuntime } from "../keyhiveRuntime";
import { bindingRecord } from "../onomancy";
import { serialForBody } from "../namestore";
import blankAvatarImg from "../assets/blankavatar.jpeg";
import * as syncServer from "../syncServer";
import { CertificateBox } from "./CertificateBox";

interface NamestorePanelProps {
  namestoreUrl: AutomergeUrl | null;
  hive: AutomergeRepoKeyhive;
  /** From `useKeyhiveUpdates`, so the member list re-reads as keyhive changes. */
  keyhiveVersion: number;
}

/**
 * The namestore's id and the DNS record that binds a domain to it.
 *
 * Publishing the record is what turns `~/todos/groceries` into
 * `@yourdomain/todos/groceries` for everyone else. Nothing about the documents
 * changes when a domain is added: the name is a second spelling of an identity
 * that already had one, which is the property that makes a binding safe to add
 * late and safe to leave off.
 */
export function NamestorePanel({
  namestoreUrl,
  hive,
  keyhiveVersion,
}: NamestorePanelProps) {
  const repo = useRepo();
  // A namestore is an ordinary keyhive document, so the same target the share
  // sheet builds for a task list works here unchanged.
  const target = useMemo(
    () =>
      namestoreUrl
        ? createDocumentTarget(keyhiveRuntime, hive, namestoreUrl)
        : null,
    [hive, namestoreUrl]
  );

  const record = useMemo(() => {
    if (!namestoreUrl) return null;
    const documentId = keyhiveRuntime
      .docIdFromAutomergeUrl(namestoreUrl)
      .toBytes();
    const generationKey = hive.active.individual.id.toBytes();
    // The serial is derived from the body and remembered, so reopening this
    // panel shows the record the user may already have published rather than a
    // freshly minted one. Only a changed binding earns a new serial.
    const body = bindingRecord(generationKey, documentId, 0n);
    return bindingRecord(generationKey, documentId, serialForBody(body));
  }, [namestoreUrl, hive]);

  if (!namestoreUrl) {
    return (
      <p className="text-sm text-muted-foreground">
        Preparing this identity's namestore...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Your names live in this document. Whoever holds admin on it can bind
        names in it, so sharing the name is sharing the document.
      </p>

      <CopyableField
        label="Namestore id"
        value={namestoreUrl}
        help="Share this to let someone else read, or with admin access write, your names."
      />

      {record && (
        <CopyableField
          label="DNS record"
          value={record}
          help={`Publish as a TXT record at _onomancy.<your-domain>. Once it is signed by DNSSEC, ${uint8ArrayToHex(
            hive.active.individual.id.toBytes()
          ).slice(0, 8)}... speaks for that domain.`}
        />
      )}

      <p className="text-xs text-muted-foreground">
        The record names the document, not you. Ownership of the name is whoever
        the document grants admin to, so it is shared by inviting another admin
        rather than by editing DNS again.
      </p>

      {target && (
        <div className="pt-3 border-t border-border">
          <p className="text-sm text-muted-foreground mb-3">
            Who can read your names. A name resolves only for someone who can
            read this document, so a published DNS record without readers here
            resolves for nobody but you. Adding an admin hands them the name.
          </p>

          {/*
           * publicAccessLevel="read", never the "edit" default: this is the
           * document a DNS record designates, so public edit would let any
           * stranger who resolves a name rewrite the edge and repoint the
           * domain at a document of their choosing. That is an open redirect
           * published in DNS, not a public phonebook.
           */}
          <AccessEditor
            target={target}
            refreshToken={keyhiveVersion}
            publicAccessLevel="read"
            labelForMember={(member) =>
              member.isSyncServer ? syncServer.DISPLAY_NAME : undefined
            }
            fallbackAvatarSrc={blankAvatarImg}
          />
        </div>
      )}

      <CertificateBox repo={repo} hive={hive} defaultTarget={namestoreUrl} />
    </div>
  );
}
