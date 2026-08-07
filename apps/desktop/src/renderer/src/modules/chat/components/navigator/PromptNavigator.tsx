import { memo, useEffect, useRef, useState } from "react";
import { ListTree, PanelRightClose } from "lucide-react";
import {
  buildPromptNavigationItems,
  getPromptAnchorId,
  type PromptNavItem,
} from "./promptNavigatorUtils";
import type { ChatViewItem } from "../../controller/chatViewTypes";

type Props = {
  messages: ChatViewItem[];
  runId: string;
  /** Hide when right file panel occupies space. */
  suppressed?: boolean;
};

export const PromptNavigator = memo(function PromptNavigator({
  messages,
  runId,
  suppressed,
}: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  const items: PromptNavItem[] = buildPromptNavigationItems(
    messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.kind === "user" || m.kind === "assistant" ? m.content : "",
    })),
  );

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 960);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!activeId || !open) return;
    const el = rootRef.current?.querySelector<HTMLElement>(
      `[data-prompt-nav-id="${CSS.escape(activeId)}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeId, open]);

  if (suppressed || narrow || items.length < 2) return null;

  const scrollTo = (messageId: string) => {
    setActiveId(messageId);
    const anchor = document.getElementById(
      getPromptAnchorId(runId, messageId),
    );
    anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="prompt-navigator-trigger"
        onClick={() => setOpen(true)}
        title="Prompt navigator"
        aria-label="Show prompt navigator"
      >
        <ListTree size={16} />
        <span className="prompt-navigator-count">{items.length}</span>
      </button>
    );
  }

  return (
    <aside
      ref={rootRef}
      className="prompt-navigator"
      aria-label="Prompt navigator"
    >
      <header className="prompt-navigator-header">
        <strong>Prompts</strong>
        <span className="prompt-navigator-count">{items.length}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide prompt navigator"
        >
          <PanelRightClose size={16} />
        </button>
      </header>
      <ul className="prompt-navigator-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-prompt-nav-id={item.messageId}
              className={
                activeId === item.messageId
                  ? "prompt-navigator-item is-active"
                  : "prompt-navigator-item"
              }
              onClick={() => scrollTo(item.messageId)}
            >
              {item.summary}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
});
