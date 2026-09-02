import { useCallback, useMemo, useState } from "react";
import type {
  AutomergeRepoKeyhive,
  Group,
} from "@automerge/automerge-repo-keyhive";
import {
  Avatar,
  bytesToHex,
  createGroupTarget,
  Modal,
  AccessEditor,
  ProfileEditor,
  shortId,
  useDirectoryEntry,
} from "@automerge/keyhive-react";
import blankAvatarImg from "../assets/blankavatar.jpeg";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "../useContextMenu";
import { keyhiveRuntime } from "../keyhiveRuntime";
import * as syncServer from "../syncServer";
import { errorMessage } from "../log";

interface GroupsPanelProps {
  hive: AutomergeRepoKeyhive;
  keyhiveVersion: number;
}

/**
 * Group management panel.
 */
export function GroupsPanel({ hive, keyhiveVersion }: GroupsPanelProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const createGroup = useCallback(async () => {
    setError(null);
    try {
      const group = await hive.generateGroup();
      setGroups((previous) => [...previous, group]);
      setOpenGroup(group);
    } catch (err) {
      setError(`Could not create a group: ${errorMessage(err)}`);
    }
  }, [hive]);

  // Only drops the group from this list. Nobody loses access.
  const removeGroup = useCallback((toRemove: Group) => {
    const id = bytesToHex(toRemove.id.toBytes());
    setGroups((previous) =>
      previous.filter((group) => bytesToHex(group.id.toBytes()) !== id)
    );
    setOpenGroup((open) =>
      open && bytesToHex(open.id.toBytes()) === id ? null : open
    );
  }, []);

  return (
    <div className="p-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">Groups</h2>
        <button
          onClick={() => void createGroup()}
          className="text-sm px-2 py-1 rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:border-ring transition-colors cursor-pointer"
        >
          + New Group
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          A group can be granted access to a document.
        </p>
      ) : (
        <ul className="space-y-1">
          {groups.map((group) => (
            <GroupRow
              key={bytesToHex(group.id.toBytes())}
              group={group}
              onOpen={() => setOpenGroup(group)}
              onContextMenu={(e) =>
                openMenu(e, [
                  {
                    label: "Remove from sidebar",
                    onSelect: () => removeGroup(group),
                  },
                ])
              }
            />
          ))}
        </ul>
      )}

      {openGroup && (
        <GroupModal
          group={openGroup}
          hive={hive}
          keyhiveVersion={keyhiveVersion}
          onClose={() => setOpenGroup(null)}
        />
      )}

      <ContextMenu state={menu} onClose={closeMenu} />
    </div>
  );
}

function GroupRow({
  group,
  onOpen,
  onContextMenu,
}: {
  group: Group;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const id = bytesToHex(group.id.toBytes());
  const entry = useDirectoryEntry(id);

  return (
    <li>
      <button
        onClick={onOpen}
        onContextMenu={onContextMenu}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left cursor-pointer"
      >
        <Avatar
          avatar={entry?.avatar}
          name={entry?.name ?? id}
          sizeClassName="w-6 h-6"
          fallbackSrc={blankAvatarImg}
        />
        <span className="text-sm text-foreground truncate">
          {entry?.name ?? shortId(id)}
        </span>
      </button>
    </li>
  );
}

function GroupModal({
  group,
  hive,
  keyhiveVersion,
  onClose,
}: {
  group: Group;
  hive: AutomergeRepoKeyhive;
  keyhiveVersion: number;
  onClose: () => void;
}) {
  const syncServerId = syncServer.identifierHex();
  const target = useMemo(
    () => createGroupTarget(keyhiveRuntime, hive, group, { syncServerId }),
    [hive, group, syncServerId]
  );

  return (
    <Modal isOpen onClose={onClose} title="Group">
      <ProfileEditor
        id={bytesToHex(group.id.toBytes())}
        kind="group"
        nameLabel="Group name"
        namePlaceholder="Name this group"
        saveLabel="Save group"
      />
      {/*
       * No public access control on a group, deliberately.
       *
       * For a document, `setPublicAccess` grants the public agent access to
       * that one document. For a group it is `addMember(publicAgent, group,
       * access)` — it makes the world a MEMBER of the group, so everyone
       * transitively receives every document the group holds, including
       * through nested groups. The blast radius is not one document but
       * everything the group can reach, now and in future.
       *
       * A button labelled "Make Public" cannot honestly convey that, and we
       * have no demo case that wants it, so the control is not offered at all.
       * Suppressing it is the whole fix: there is no access level that makes
       * the button safe, because the hazard is the membership edge and not the
       * level on it.
       */}
      <AccessEditor
        target={target}
        refreshToken={keyhiveVersion}
        showPublicAccess={false}
        labelForMember={(member) =>
          member.isSyncServer ? syncServer.DISPLAY_NAME : undefined
        }
        fallbackAvatarSrc={blankAvatarImg}
        className="mt-6"
      />
      <p className="mt-4 text-xs text-muted-foreground">
        This group can be given access to a document from that document's share
        dialog.
      </p>
    </Modal>
  );
}
