import { useEffect, useState } from "react";
import { AutomergeUrl, useRepo } from "@automerge/react/slim";
import { Modal } from "@automerge/keyhive-react";
import { bindEdge } from "../namestore";
import { rootOf } from "../names";
import { parseName } from "../onomancy";
import { errorMessage, log } from "../log";

interface NameModalProps {
  isOpen: boolean;
  /** The document being named. */
  docUrl: AutomergeUrl;
  /** This identity's namestore, the target for `~` names. */
  namestoreUrl: AutomergeUrl | null;
  onClose: () => void;
}

/**
 * Bind a name to a document.
 *
 * The anchor of the name being bound decides which namestore receives the
 * edge, not this component: `~/todos/groceries` writes into our own namestore,
 * `@example.com/todos` into whatever document that domain designates, and
 * `automerge:…/todos` into that document. All three then write the same edge,
 * which is the point — an anchor picks a starting document and nothing more.
 */
export function NameModal({
  isOpen,
  docUrl,
  namestoreUrl,
  onClose,
}: NameModalProps) {
  const repo = useRepo();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bound, setBound] = useState<string | null>(null);
  const [isBinding, setIsBinding] = useState(false);

  // A name belongs to the document it was typed for.
  useEffect(() => {
    setInput("");
    setError(null);
    setBound(null);
  }, [docUrl, isOpen]);

  const handleBind = async (raw: string) => {
    setError(null);
    setBound(null);

    const parsed = parseName(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const { anchor, segments, value } = parsed.name;
    if (segments.length === 0) {
      setError(
        "That names the namestore itself. Add at least one path segment, such as ~/todos."
      );
      return;
    }

    setIsBinding(true);
    try {
      const target = await rootOf(parsed.name, namestoreUrl);
      await bindEdge(repo, target, segments.join("/"), docUrl);
      setBound(value);
      setInput("");
    } catch (err) {
      log.error("Could not bind the name:", err);
      setError(
        anchor.kind === "dns"
          ? `Could not bind ${value}: ${errorMessage(err)}`
          : `Could not bind the name: ${errorMessage(err)}`
      );
    } finally {
      setIsBinding(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Name this list">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A name is an edge from a namestore document to this list. Anyone who
          can read that namestore can follow the name.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isBinding) void handleBind(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="~/todos/groceries"
            aria-label="Name to bind"
            className="flex-1 h-9 px-3 bg-background border border-border rounded-md text-sm text-foreground font-mono box-border"
          />
          <button
            type="submit"
            disabled={isBinding || !namestoreUrl}
            className="h-9 px-4 bg-secondary text-secondary-foreground border border-border rounded-md text-sm font-medium cursor-pointer whitespace-nowrap hover:bg-accent hover:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBinding ? "Binding..." : "Bind"}
          </button>
        </form>

        {!namestoreUrl && (
          <p className="text-sm text-muted-foreground">
            Preparing this identity's namestore...
          </p>
        )}

        {bound && (
          <p className="text-sm text-foreground">
            Bound <code className="font-mono">{bound}</code>. Open it from the
            sidebar's name box, or share the spelling with anyone who can read
            the namestore.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
          <p>
            <code className="font-mono">~/todos/groceries</code> writes into
            your own namestore.
          </p>
          <p>
            <code className="font-mono">@example.com/todos</code> writes into
            the document that domain designates, which needs admin access on it.
          </p>
          <p>
            A bare <code className="font-mono">todos/groceries</code> is read as
            a <code className="font-mono">~</code> name.
          </p>
        </div>
      </div>
    </Modal>
  );
}
