import { useState, useCallback } from "react";
import type { View } from "../types/desktop-shell";

export interface UseDesktopNavigationResult {
  view: View;
  activeProfile: string;
  officeVisited: boolean;
  setOfficeVisited: (visited: boolean) => void;
  handleSelectProfile: (name: string) => void;
  navigateToView: (next: View) => void;
}

export function useDesktopNavigation(): UseDesktopNavigationResult {
  const [view, setView] = useState<View>("portal");
  const [activeProfile, setActiveProfile] = useState("default");
  const [officeVisited, setOfficeVisited] = useState(false);

  const handleSelectProfile = useCallback((name: string) => {
    setActiveProfile(name);
  }, []);

  const navigateToView = useCallback((next: View) => {
    if (next === "office") {
      setOfficeVisited(true);
    }
    setView(next);
  }, []);

  return {
    view,
    activeProfile,
    officeVisited,
    setOfficeVisited,
    handleSelectProfile,
    navigateToView,
  };
}
