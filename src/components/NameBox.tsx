import { useState } from "react";

interface NameBoxProps {
  /** Points the location hash at a name, which is what resolves it. */
  onResolve: (name: string) => void;
}

/**
 * Open a list by name.
 *
 * Submitting only sets the hash; the resolution itself belongs to the route,
 * so a resolved name is a shareable URL and a reload resolves it again rather
 * than restoring a stale answer.
 */
export function NameBox({ onResolve }: NameBoxProps) {
  const [input, setInput] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (trimmed) onResolve(trimmed);
      }}
      className="flex gap-2"
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="~/todos/groceries"
        aria-label="Name to resolve"
        className="flex-1 h-9 px-3 bg-background border border-border rounded-md text-sm text-foreground font-mono box-border"
      />
      <button
        type="submit"
        className="h-9 px-4 bg-secondary text-secondary-foreground border border-border rounded-md text-sm font-medium cursor-pointer whitespace-nowrap hover:bg-accent hover:border-ring transition-colors"
      >
        Open
      </button>
    </form>
  );
}
