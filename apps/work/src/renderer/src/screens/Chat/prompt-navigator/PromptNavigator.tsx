import { memo, useEffect, useRef } from "react";
import { ListTree, PanelRightClose } from "lucide-react";
import { useI18n } from "../../../components/useI18n";
import { PromptNavigatorItem } from "./PromptNavigatorItem";
import type { PromptNavigationItem } from "./promptNavigatorUtils";
import "./prompt-navigator.css";

interface PromptNavigatorProps {
  items: PromptNavigationItem[];
  activePromptId: string | null;
  open: boolean;
  compact: boolean;
  onOpenChange(open: boolean): void;
  onSelect(messageId: string): void;
}

export const PromptNavigator = memo(function PromptNavigator({
  items,
  activePromptId,
  open,
  compact,
  onOpenChange,
  onSelect,
}: PromptNavigatorProps): React.JSX.Element | null {
  const { t } = useI18n();
  const navigatorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activePromptId || !open) {
      return;
    }

    const root = navigatorRef.current;
    if (!root) {
      return;
    }

    const item = root.querySelector<HTMLElement>(
      `[data-prompt-nav-id="${CSS.escape(activePromptId)}"]`,
    );
    item?.scrollIntoView?.({ block: "nearest" });
  }, [activePromptId, open]);

  if (items.length < 2) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        className="prompt-navigator-trigger"
        onClick={() => onOpenChange(true)}
        title={t("chat.promptNavigator.show")}
        aria-label={t("chat.promptNavigator.show")}
      >
        <ListTree size={16} />
        <span className="prompt-navigator-count">{items.length}</span>
      </button>
    );
  }

  return (
    <aside
      ref={navigatorRef}
      className={[
        "prompt-navigator",
        compact ? "prompt-navigator-compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("chat.promptNavigator.title")}
    >
      <header className="prompt-navigator-header">
        <div className="prompt-navigator-header-title">
          <strong>{t("chat.promptNavigator.title")}</strong>
          <span className="prompt-navigator-count">{items.length}</span>
        </div>
        <button
          type="button"
          className="prompt-navigator-close"
          onClick={() => onOpenChange(false)}
          aria-label={t("chat.promptNavigator.hide")}
          title={t("chat.promptNavigator.hide")}
        >
          <PanelRightClose size={15} />
        </button>
      </header>

      <div className="prompt-navigator-list" role="list">
        {items.map((item) => (
          <PromptNavigatorItem
            key={item.messageId}
            item={item}
            selected={item.messageId === activePromptId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
});
