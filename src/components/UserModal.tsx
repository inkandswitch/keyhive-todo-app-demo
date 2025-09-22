import React, { useState, useEffect } from 'react';
import { Active } from '../user';
import { StateDB } from '../db';
import { IdentitiesDocument } from '../identities';
import { uint8ArrayToHex } from '../doc';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeState: Active;
  setActiveState: React.Dispatch<React.SetStateAction<Active>>;
  identitiesDoc: IdentitiesDocument;
  changeIdentitiesDoc: (updater: (doc: IdentitiesDocument) => void | Error) => void;
  db: StateDB<Active>;
  currentName?: string;
  currentAvatarUrl?: string;
}

export function UserModal({ isOpen, onClose, activeState, setActiveState, changeIdentitiesDoc, db }: UserModalProps) {
  const [name, setName] = useState(activeState.user.name || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  useEffect(() => {
    if (activeState.user.avatar) {
      const url = URL.createObjectURL(new Blob([activeState.user.avatar as BlobPart]));
      setAvatarPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAvatarPreview('');
    }
  }, [activeState.user.avatar]);

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

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    let newAvatar: Uint8Array | null = activeState.user.avatar;

    if (avatarFile) {
      const arrayBuffer = await avatarFile.arrayBuffer();
      newAvatar = new Uint8Array(arrayBuffer);
    }

    setActiveState((active: Active) => {
      const newActive = {
        ...active,
        user: {
          ...active.user,
          name: name,
          avatar: newAvatar,
        }
      }
      db.store(newActive)
      changeIdentitiesDoc((doc: IdentitiesDocument) => {
        const individual = newActive.individual
        if (individual) {
          const hexId = uint8ArrayToHex(individual.id.toBytes())
          if (!doc.identities[hexId]) {
            doc.identities[hexId] = {
              peerId: newActive.user.peerId,
              name: newActive.user.name,
              avatar: newActive.user.avatar || null,
            }
          } else {
            doc.identities[hexId].name = newActive.user.name
            doc.identities[hexId].avatar = newActive.user.avatar || null
          }
        } else {
          return new Error("Individual should have been present for active")
        }
      })
      return newActive
    })

    onClose();
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
            <h2 className="text-xl font-semibold text-foreground">User Profile</h2>
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

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <img
                  src={avatarPreview || "/blankavatar.jpeg"}
                  alt="Avatar preview"
                  className="w-20 h-20 rounded-full object-cover border-4 border-border"
                />
              </div>

              <div>
                <label htmlFor="avatar-upload" className="cursor-pointer inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-secondary-foreground bg-secondary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Avatar
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring bg-background text-foreground"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Contact Card
              </label>
              <div className="w-full px-3 py-2 bg-muted text-muted-foreground rounded-md text-sm font-mono break-all">
                {activeState.contactCard}
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-secondary-foreground bg-secondary border border-border rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary border border-transparent rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
