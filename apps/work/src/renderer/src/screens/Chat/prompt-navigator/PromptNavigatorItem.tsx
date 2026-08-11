import { memo } from "react";
import type { PromptNavigationItem } from "./promptNavigatorUtils";

interface PromptNavigatorItemProps {
  item: PromptNavigationItem;
  selected: boolean;
  onSelect(messageId: string): void;
}

export const PromptNavigatorItem = memo(function PromptNavigatorItem({
  item,
  selected,
  onSelect,
}: PromptNavigatorItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="listitem"
      data-prompt-nav-id={item.messageId}
      className={[
        "prompt-navigator-item",
        selected ? "prompt-navigator-item-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={item.fullText}
      aria-current={selected ? "location" : undefined}
      onClick={() => onSelect(item.messageId)}
    >
      <span className="prompt-navigator-index">{item.sequence}</span>
      <span className="prompt-navigator-label">{item.label}</span>
    </button>
  );
});
