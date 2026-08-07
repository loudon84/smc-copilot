import type { ProfileEntrySummary } from "../../../../shared/profile-runtime/profile-runtime-contract";
import type { View } from "../../types/desktop-shell";

export type SidebarMode = "expanded" | "rail" | "hidden";

export interface ExternalBrowserTab {
  id: `external-browser:${string}`;
  title: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}

export interface MainWorkspaceTab {
  id: View;
  titleKey?: string;
  title?: string;
  closeable: boolean;
  source: "system" | "profile" | "operator" | "external";
  profileId?: string;
}

export interface MainPageViewModel {
  activeView: View;
  activeProfile: string;
  sidebarMode: SidebarMode;
  profileEntries: ProfileEntrySummary[];
}
