import { Identity } from "../active";

interface AvatarIconProps {
  onClick: () => void;
  identityState: Identity;
}

export function AvatarIcon({ onClick, identityState }: AvatarIconProps) {
  const avatarUrl = identityState.contact.avatar
    ? URL.createObjectURL(
        new Blob([identityState.contact.avatar as BlobPart], {
          type: "image/jpeg",
        }),
      )
    : null;

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary hover:bg-accent transition-colors duration-200 border-2 border-transparent hover:border-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      aria-label="User profile"
    >
      <img
        src={avatarUrl || "/blankavatar.jpeg"}
        alt={identityState.contact.name || "User avatar"}
        className="w-full h-full rounded-full object-cover"
      />
    </button>
  );
}
