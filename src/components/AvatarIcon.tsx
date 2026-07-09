import { useEffect, useMemo } from "react";
import { Identity } from "../active";
import blankAvatarImg from "../assets/blankavatar.jpeg";

interface AvatarIconProps {
  onClick: () => void;
  identityState: Identity;
}

export function AvatarIcon({ onClick, identityState }: AvatarIconProps) {
  const avatar = identityState.contact.avatar;
  const avatarUrl = useMemo(
    () =>
      avatar
        ? URL.createObjectURL(
            new Blob([avatar as BlobPart], { type: "image/jpeg" }),
          )
        : null,
    [avatar],
  );
  // Free the blob URL when the avatar changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    };
  }, [avatarUrl]);

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary hover:bg-accent transition-colors duration-200 border-2 border-transparent hover:border-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      aria-label="User profile"
    >
      <img
        src={avatarUrl || blankAvatarImg}
        alt={identityState.contact.name || "User avatar"}
        className="w-full h-full rounded-full object-cover"
      />
    </button>
  );
}
