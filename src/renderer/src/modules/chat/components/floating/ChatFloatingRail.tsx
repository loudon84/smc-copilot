import { useEffect, useRef, useState } from "react";
import { Folder, ListTree, PanelRightClose } from "lucide-react";
import type { ChatViewItem } from "../../controller/chatViewTypes";
import {
  buildPromptNavigationItems,
  getPromptAnchorId,
} from "../navigator/promptNavigatorUtils";
import { FloatingActionButton } from "./FloatingActionButton";

export type ChatFloatingRailProps = {
  messages: ChatViewItem[];
  runId: string;
  sessionFiles: {
    count: number;
    active: boolean;
    disabled: boolean;
    onToggle: () => void;
  };
};

/**
 * Fixed right-side floating actions for Prompt Navigator + Session Files.
 * Does not scroll with the message list and is not part of the Composer.
 */
export function ChatFloatingRail({
  messages,
  runId,
  sessionFiles,
}: ChatFloatingRailProps): React.JSX.Element {
  const [promptOpen, setPromptOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  const items = buildPromptNavigationItems(
    messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.kind === "user" || m.kind === "assistant" ? m.content : "",
    })),
  );
  const showPrompt = items.length >= 2;

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 960);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!activeId || !promptOpen) return;
    const el = panelRef.current?.querySelector<HTMLElement>(
      `[data-prompt-nav-id="${CSS.escape(activeId)}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeId, promptOpen]);

  const scrollTo = (messageId: string) => {
    setActiveId(messageId);
    const anchor = document.getElementById(
      getPromptAnchorId(runId, messageId),
    );
    anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div
      className={`chat-floating-rail ${promptOpen ? "is-panel-open" : ""}`.trim()}
      data-testid="chat-floating-rail"
    >
      {showPrompt ? (
        <div className="chat-floating-rail-item">
          {promptOpen ? (
            <aside
              ref={panelRef}
              className="prompt-navigator prompt-navigator--rail"
              aria-label="Prompt navigator"
            >
              <header className="prompt-navigator-header">
                <strong>Prompts</strong>
                <span className="prompt-navigator-count">{items.length}</span>
                <button
                  type="button"
                  onClick={() => setPromptOpen(false)}
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
          ) : (
            <FloatingActionButton
              title="Prompt navigator"
              active={false}
              badge={narrow ? null : items.length}
              onClick={() => setPromptOpen(true)}
              data-testid="chat-fab-prompt"
            >
              <ListTree size={16} />
            </FloatingActionButton>
          )}
        </div>
      ) : null}

      <div className="chat-floating-rail-item">
        <FloatingActionButton
          title="Session files"
          active={sessionFiles.active}
          disabled={sessionFiles.disabled}
          badge={sessionFiles.count > 0 ? sessionFiles.count : null}
          onClick={sessionFiles.onToggle}
          data-testid="chat-fab-files"
        >
          <Folder size={16} />
        </FloatingActionButton>
      </div>
    </div>
  );
}
