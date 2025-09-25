import { useState, useEffect, useMemo } from 'react';
import { AutomergeUrl } from '@automerge/react';
import { Access, ContactCard, DocumentId, Keyhive } from '@keyhive/keyhive/slim';
import { accessListForDoc, addMemberToDoc, revokeMemberFromDoc, DocAccessList, uint8ArrayToHex } from '../doc';
import { Active } from "@automerge/rootstock-identity";
import { IdentitiesDocument } from '@automerge/rootstock-identity';

interface ShareModalProps {
  isOpen: boolean;
  docUrl: AutomergeUrl;
  identitiesDoc: IdentitiesDocument;
  keyhive: Keyhive;
  storeKeyhive: (kh: Keyhive) => void,
  keyhiveUpdateTracker: number;
  active: Active;
  onClose: () => void;
}

export function ShareModal({ isOpen, docUrl, identitiesDoc, keyhive, storeKeyhive, keyhiveUpdateTracker, active, onClose }: ShareModalProps) {
  const [userIdInput, setUserIdInput] = useState('');
  const [selectedAccessLevel, setSelectedAccessLevel] = useState('Write');

  const currentUserAccess = useMemo(() => {
    const id = active.individual?.id;
    // FIXME: This should probably be an error
    if (!id) return undefined;

    const docIdBytes = identitiesDoc.docIds[docUrl];
    if (!docIdBytes) return undefined;

    const keyhiveDocId = new DocumentId(docIdBytes);

    try {
      const access = keyhive.accessForDoc(id, keyhiveDocId);
      return access ? access.toString() : undefined;
    } catch (error) {
      console.error("Error checking access level:", error);
      return undefined;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyhiveUpdateTracker, active.individual?.id, identitiesDoc.docIds, docUrl, keyhive]);

  const accessLevels = ['Pull', 'Read', 'Write', 'Admin'];
  // You can share at your access level and below
  const sharingOptions = currentUserAccess
    ? accessLevels.filter((_, i) => i <= accessLevels.indexOf(currentUserAccess))
    : [];

  const currentUserHexId = active.individual?.id ?
    uint8ArrayToHex(active.individual.id.toBytes()) : null;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userIdInput.trim()) {
      try {
        const contactCardString = userIdInput.trim();
        // Validate JSON by parsing it
        const contactCard = ContactCard.fromJson(contactCardString);
        const access = Access.tryFromString(selectedAccessLevel.toLowerCase())
        if (!access) {
          console.error("Failed to derive Access");
          return;
        }
        const individual = keyhive.receiveContactCard(contactCard)
        await addMemberToDoc(keyhive, docUrl, identitiesDoc, individual, access, storeKeyhive)

        setUserIdInput('');
      } catch (error) {
        console.error("Error adding user:", error);
      }
    }
  };

  const handleRemoveUser = async (hexId: string) => {
    try {
      await revokeMemberFromDoc(keyhive, docUrl, identitiesDoc, hexId, storeKeyhive);
    } catch (error) {
      console.error("Error removing user:", error);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const khDocId = new DocumentId(identitiesDoc.docIds[docUrl])
  let docAccessList: DocAccessList = {}
  if (khDocId) {
    docAccessList = accessListForDoc(keyhive, khDocId)
  } else {
    // FIXME
    console.error("NO DOC!")
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-200"
      onClick={handleBackdropClick}
      style={{
        animation: isOpen ? 'fadeIn 0.2s ease-out' : undefined
      }}
    >
      <div
        className="bg-card rounded-lg shadow-lg border border-border max-w-md w-full max-h-[90vh] overflow-auto transition-all duration-200 transform ring-1 ring-ring/20 ring-offset-2 ring-offset-background"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: isOpen ? 'slideIn 0.2s ease-out' : undefined
        }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">Share this list</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                {sharingOptions.map(level => (
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

          <hr className="border-border mb-6" />

          <div>
            <h3 className="text-sm font-medium text-foreground mb-4">Current Access</h3>
            <div className="space-y-3">
              {Object.keys(docAccessList).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No users have access yet</p>
              ) : (
                Object.entries(docAccessList)
                  .sort(([hexIdA], [hexIdB]) => {
                    // Look up identity info for sorting
                    const identityA = identitiesDoc.identities[hexIdA];
                    const identityB = identitiesDoc.identities[hexIdB];

                    // Use name if available, otherwise use hex ID for sorting
                    const nameA = identityA?.name || `0x${hexIdA.slice(0, 12)}...`;
                    const nameB = identityB?.name || `0x${hexIdB.slice(0, 12)}...`;

                    return nameA.localeCompare(nameB);
                  })
                  .map(([hexId, access], index) => {

                  const identity = identitiesDoc.identities[hexId];
                  const displayName = identity?.name || `0x${hexId.slice(0, 12)}...`;
                  const avatarSrc = identity?.avatar
                    ? URL.createObjectURL(new Blob([new Uint8Array(identity.avatar)]))
                    : "/blankavatar.jpeg";

                  return (
                    <div key={`${hexId}-${index}`} className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
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
                            {access.toString().toUpperCase()}
                          </div>
                        </div>
                      </div>
                      {currentUserAccess === "Admin" && hexId !== currentUserHexId && (
                        <button
                          onClick={() => handleRemoveUser(hexId)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          aria-label="Remove user"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
