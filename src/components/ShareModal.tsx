import { useState, useEffect } from "react";
import { AutomergeUrl } from "@automerge/react/slim";
import { Phonebook } from "../phonebook";
import {
  Access,
  AutomergeRepoKeyhiveRust,
  ContactCard,
  type DocMember,
} from "@automerge/automerge-repo-keyhive";
import blankAvatarImg from "../assets/blankavatar.jpeg";

interface ShareModalProps {
  isOpen: boolean;
  docUrl: AutomergeUrl;
  phonebook: Phonebook | undefined;
  hive: AutomergeRepoKeyhiveRust;
  keyhiveUpdateTracker: number;
  onClose: () => void;
}

export function ShareModal({
  isOpen,
  docUrl,
  phonebook,
  hive,
  keyhiveUpdateTracker,
  onClose,
}: ShareModalProps) {
  const [userIdInput, setUserIdInput] = useState("");
  const [selectedAccessLevel, setSelectedAccessLevel] = useState("Edit");
  const [members, setMembers] = useState<DocMember[]>([]);
  const [isLoadingAccessList, setIsLoadingAccessList] = useState(true);

  // The current user and the public member are just entries in the member
  // list, tagged by listMembers.
  const currentUserAccess = members.find((m) => m.isSelf)?.access.toString();
  const publicMember = members.find((m) => m.isPublic);
  const currentPublicAccess = publicMember?.access.toString();

  const accessLevels = ["Relay", "Read", "Edit", "Admin"];
  // You can share at your access level and below
  const sharingOptions = currentUserAccess
    ? accessLevels.filter(
        (_, i) => i <= accessLevels.indexOf(currentUserAccess),
      )
    : [];

  // Reset selectedAccessLevel when sharingOptions changes
  useEffect(() => {
    if (
      sharingOptions.length > 0 &&
      !sharingOptions.includes(selectedAccessLevel)
    ) {
      setSelectedAccessLevel(sharingOptions[sharingOptions.length - 1]);
    }
  }, [sharingOptions, selectedAccessLevel]);

  const handleMakePublic = async () => {
    try {
      await hive.setPublicAccess(docUrl, Access.edit());
    } catch (error) {
      console.error("[Demo] Error making document public:", error);
    }
  };

  const displayNameFor = (member: DocMember) => {
    if (member.isPublic) return "Public";
    if (member.isSyncServer) return "Demo Sync Server";
    return phonebook?.[member.id]?.name || `0x${member.id.slice(0, 12)}...`;
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchMembers() {
      if (!cancelled) {
        setIsLoadingAccessList(true);
      }

      const list = await hive.listMembers(docUrl);
      if (!cancelled) {
        setMembers(list);
        setIsLoadingAccessList(false);
      }
    }

    if (isOpen) {
      fetchMembers();
    }

    return () => {
      cancelled = true;
    };
  }, [keyhiveUpdateTracker, docUrl, hive, isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userIdInput.trim()) {
      try {
        const contactCardString = userIdInput.trim();
        // Validate JSON by parsing it
        const contactCard = ContactCard.fromJson(contactCardString);

        // Throws on an unrecognized access level.
        const access = Access.fromString(selectedAccessLevel);

        await hive.addMemberToDoc(docUrl, contactCard, access);

        setUserIdInput("");
      } catch (error) {
        console.error("[Demo] Error adding user:", error);
      }
    }
  };

  const handleRemoveUser = async (hexId: string) => {
    try {
      await hive.revokeMemberFromDoc(docUrl, hexId);
    } catch (error) {
      console.error("[Demo] Error removing user:", error);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-200"
      onClick={handleBackdropClick}
      style={{
        animation: isOpen ? "fadeIn 0.2s ease-out" : undefined,
      }}
    >
      <div
        className="bg-card rounded-lg shadow-lg border border-border max-w-md w-full max-h-[90vh] overflow-auto transition-all duration-200 transform ring-1 ring-ring/20 ring-offset-2 ring-offset-background"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: isOpen ? "slideIn 0.2s ease-out" : undefined,
        }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Share this list
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleAddUser} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder="Contact Card"
                className="flex-1 px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-background text-foreground"
              />
              <select
                value={selectedAccessLevel}
                onChange={(e) => setSelectedAccessLevel(e.target.value)}
                className="px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-background text-foreground"
              >
                {sharingOptions.map((level) => (
                  <option key={level} value={level}>
                    {level.toUpperCase()}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors border border-border"
              >
                Add
              </button>
            </div>
          </form>

          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-foreground">
              {currentPublicAccess ? (
                <>
                  This list is <span className="font-medium">public</span> (
                  {currentPublicAccess.toUpperCase()})
                </>
              ) : (
                <>
                  This list is <span className="font-medium">private</span>
                </>
              )}
            </p>
            {currentUserAccess === "Admin" &&
              (currentPublicAccess ? (
                <button
                  onClick={() =>
                    publicMember && handleRemoveUser(publicMember.id)
                  }
                  className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors border border-border"
                >
                  Make Private
                </button>
              ) : (
                <button
                  onClick={handleMakePublic}
                  className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors border border-border"
                >
                  Make Public
                </button>
              ))}
          </div>

          <hr className="border-border mb-6" />

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">
              Current Access
            </h3>
            <div className="space-y-3">
              {isLoadingAccessList ? (
                <p className="text-sm text-muted-foreground italic">
                  Loading...
                </p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No users have access yet
                </p>
              ) : (
                [...members]
                  .sort((a, b) =>
                    displayNameFor(a).localeCompare(displayNameFor(b)),
                  )
                  .map((member, index) => {
                    const contact = phonebook?.[member.id];
                    const displayName = displayNameFor(member);
                    const avatarSrc = contact?.avatar
                      ? URL.createObjectURL(
                          new Blob([new Uint8Array(contact.avatar)]),
                        )
                      : blankAvatarImg;

                    return (
                      <div
                        key={`${member.id}-${index}`}
                        className="flex items-center justify-between py-2 px-3 bg-muted rounded-md"
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={avatarSrc}
                            alt="User avatar"
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {displayName}
                            </div>
                            <div className="text-sm font-medium text-foreground">
                              {member.access.toString().toUpperCase()}
                            </div>
                          </div>
                        </div>
                        {currentUserAccess === "Admin" && !member.isSelf && (
                          <button
                            onClick={() => handleRemoveUser(member.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            aria-label="Remove user"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
