import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProfileSwitcherDropdown } from "../../components/dropdowns/ProfileSwitcherDropdown";
import type { View } from "../../types/desktop-shell";

interface AnchorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_ANCHOR: AnchorBounds = { x: 0, y: 40, width: 120, height: 40 };

interface MainProfileSwitchProps {
  activeProfile: string;
  onSelectProfile: (name: string) => void;
  onNavigate: (view: View) => void;
  onOpenRuntimeSettings?: () => void;
}

export function MainProfileSwitch({
  activeProfile,
  onSelectProfile,
  onNavigate,
  onOpenRuntimeSettings,
}: MainProfileSwitchProps): React.JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorBounds, setAnchorBounds] = useState<AnchorBounds>(DEFAULT_ANCHOR);

  const openDropdown = useCallback(() => {
    const el = buttonRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setAnchorBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setAnchorBounds(DEFAULT_ANCHOR);
    }
    setOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="MainProfileSwitch no-drag"
        aria-label="Switch profile"
        aria-expanded={open}
        onClick={openDropdown}
      >
        <span className="MainProfileSwitch__label">{activeProfile}</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open ? (
        <ProfileSwitcherDropdown
          anchorBounds={anchorBounds}
          currentProfile={activeProfile}
          onClose={closeDropdown}
          onSelectProfile={onSelectProfile}
          onManageProfiles={() => onOpenRuntimeSettings?.()}
          onCreateProfile={() => onNavigate("workspaces")}
        />
      ) : null}
    </>
  );
}
