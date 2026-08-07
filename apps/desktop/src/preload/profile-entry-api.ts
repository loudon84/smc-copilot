import { ipcRenderer } from "electron";
import type { ProfileEntryAPI } from "../shared/profile-runtime/profile-runtime-contract";

export const profileEntryApi: ProfileEntryAPI = {
  listProfileEntries: () => ipcRenderer.invoke("profile-entry:list"),

  getProfileEntry: (profileId: string) => ipcRenderer.invoke("profile-entry:get", profileId),

  openProfileEntry: (profileId: string) => ipcRenderer.invoke("profile-entry:open", profileId),

  getProfilePageLayout: (profileId: string) => ipcRenderer.invoke("profile-entry:get-layout", profileId),

  updateProfilePageLayout: (profileId: string, layout) => ipcRenderer.invoke("profile-entry:update-layout", profileId, layout),
};
