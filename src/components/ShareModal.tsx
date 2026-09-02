import { useEffect, useMemo, useState } from "react";
import { AutomergeUrl } from "@automerge/react/slim";
import {
  Access,
  AutomergeRepoKeyhive,
} from "@automerge/automerge-repo-keyhive";
import {
  createDocumentTarget,
  Modal,
  AccessEditor,
  useDirectory,
  useTargetMembers,
} from "@automerge/keyhive-react";
import { keyhiveRuntime } from "../keyhiveRuntime";
import blankAvatarImg from "../assets/blankavatar.jpeg";
import linkAvatarImg from "../assets/link-avatar.png";
import * as syncServer from "../syncServer";
import { createInviteLink, type InviteLink } from "../invite";
import { copyToClipboard } from "../clipboard";
import { errorMessage, log } from "../log";

/**
 * The avatar for invite links to make them recognizable.
 */
let inviteAvatar: Promise<Uint8Array> | null = null;

function inviteAvatarBytes(): Promise<Uint8Array> {
  inviteAvatar ??= fetch(linkAvatarImg)
    .then((res) => res.arrayBuffer())
    .then((buffer) => new Uint8Array(buffer))
    .catch((error: unknown) => {
      inviteAvatar = null;
      throw error;
    });
  return inviteAvatar;
}

interface ShareModalProps {
  isOpen: boolean;
  docUrl: AutomergeUrl;
  hive: AutomergeRepoKeyhive;
  keyhiveVersion: number;
  onClose: () => void;
}

export function ShareModal({
  isOpen,
  docUrl,
  hive,
  keyhiveVersion,
  onClose,
}: ShareModalProps) {
  const target = useMemo(
    () => createDocumentTarget(keyhiveRuntime, hive, docUrl),
    [hive, docUrl]
  );
  const directory = useDirectory();

  const { selfAccess } = useTargetMembers(target, keyhiveVersion, isOpen);
  const canInvite = selfAccess?.atLeast(Access.admin()) ?? false;

  const [invite, setInvite] = useState<InviteLink | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A link belongs to the document it was made for, so drop it when the modal
  // is reopened or pointed at a different list.
  useEffect(() => {
    setInvite(null);
    setInviteError(null);
    setCopied(false);
  }, [docUrl, isOpen]);

  // Create a throwaway identity, give it the selected access level, and return
  // a link that lets anyone act as it. The identity shows up in the member list
  // below like any other member, which is also how the link gets turned off.
  const handleCreateInviteLink = async (level: string) => {
    if (isCreatingInvite) return;
    setInviteError(null);
    setIsCreatingInvite(true);
    try {
      const link = await createInviteLink(
        hive,
        docUrl,
        Access.fromString(level)
      );
      setInvite(link);
      setCopied(await copyToClipboard(link.url));
      // Give it a name and a link icon in the phonebook to make it recognizable.
      try {
        await directory.publish?.({
          id: link.memberId,
          name: link.name,
          avatar: await inviteAvatarBytes(),
          kind: "individual",
        });
      } catch (err) {
        log.error("Could not name the invite link in the phonebook:", err);
      }
    } catch (err) {
      log.error("Error creating invite link:", err);
      setInviteError(`Could not create an invite link: ${errorMessage(err)}`);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share this list">
      {/*
       * publicAccessLevel is stated rather than inherited. "edit" is the
       * deliberate behaviour this demo has always had — a public task list
       * anyone can add tasks to is the collaborative case worth showing, and
       * it was hardcoded as `Access.edit()` here before the component was
       * extracted. It is spelled out because the library's default happens to
       * agree by accident: that default is this very call site's old constant,
       * promoted to an API contract by extraction, and it is wrong for every
       * other document type. See NamestorePanel, where it must be "read".
       */}
      <AccessEditor
        target={target}
        refreshToken={keyhiveVersion}
        publicAccessLevel="edit"
        enabled={isOpen}
        labelForMember={(member) =>
          member.isSyncServer ? syncServer.DISPLAY_NAME : undefined
        }
        fallbackAvatarSrc={blankAvatarImg}
        renderAfterAdd={({ selectedLevel }) =>
          !canInvite ? (
            <p className="text-sm text-muted-foreground">
              Only an admin can create an invite link, since only an admin can
              turn one off again.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground">
                  Invite link ({selectedLevel.toUpperCase()})
                </p>
                <button
                  onClick={() => void handleCreateInviteLink(selectedLevel)}
                  disabled={isCreatingInvite}
                  className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors border border-border disabled:opacity-50"
                >
                  {isCreatingInvite ? "Creating..." : "Create invite link"}
                </button>
              </div>
              {inviteError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {inviteError}
                </p>
              )}
              {invite && (
                <div className="mt-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={invite.url}
                      onFocus={(e) => e.target.select()}
                      aria-label="Invite link"
                      className="flex-1 px-3 py-2 border border-border rounded-md shadow-sm text-sm bg-muted text-foreground"
                    />
                    <button
                      onClick={() =>
                        void copyToClipboard(invite.url).then(setCopied)
                      }
                      className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors border border-border"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {copied ? "Copied. " : "Copy the link above to share it. "}
                    Anyone with this link can join. To disable the link, remove{" "}
                    <span className="font-medium text-foreground">
                      {invite.name}
                    </span>{" "}
                    below.
                  </p>
                </div>
              )}
            </>
          )
        }
      />
    </Modal>
  );
}
