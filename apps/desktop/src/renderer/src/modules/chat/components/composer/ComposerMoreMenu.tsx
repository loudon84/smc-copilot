import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

type Props = {
  children: React.ReactNode;
  label?: string;
};

/**
 * Overflow menu for narrow composer widths — advanced controls go here.
 */
export function ComposerMoreMenu({
  children,
  label = "More",
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="composer-more-menu-wrap">
      <button
        type="button"
        className="copilot-icon-btn"
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="composer-more-menu" role="menu">
          {children}
          <button
            type="button"
            className="composer-more-menu-close"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
