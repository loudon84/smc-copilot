import { useState, useEffect } from "react";

interface DropdownShowEvent {
  key: string;
  anchorBounds: { x: number; y: number; width: number; height: number };
  preferredDirection: string;
  data?: unknown;
}

interface DropdownCloseEvent {
  key: string;
}

export function useDropdownManager() {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownData, setDropdownData] = useState<unknown>(null);
  const [anchorBounds, setAnchorBounds] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const cleanupShow = window.hermesAPI.onDropdownShow((event: DropdownShowEvent) => {
      setActiveDropdown(event.key);
      setDropdownData(event.data);
      // Calculate position from anchorBounds
      setAnchorBounds({
        x: event.anchorBounds.x,
        y: event.anchorBounds.y + event.anchorBounds.height,
      });
    });

    const cleanupClose = window.hermesAPI.onDropdownClose((event: DropdownCloseEvent) => {
      if (activeDropdown === event.key) {
        setActiveDropdown(null);
      }
    });

    const cleanupCloseAll = window.hermesAPI.onDropdownCloseAll(() => {
      setActiveDropdown(null);
    });

    return () => {
      cleanupShow();
      cleanupClose();
      cleanupCloseAll();
    };
  }, [activeDropdown]);

  const closeDropdown = () => {
    setActiveDropdown(null);
  };

  return { activeDropdown, dropdownData, anchorBounds, closeDropdown };
}
