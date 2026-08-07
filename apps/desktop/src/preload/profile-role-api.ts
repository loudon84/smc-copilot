import { ipcRenderer } from "electron";
import type { ProfileRoleAPI } from "../shared/profile-roles/profile-role-contract";

export const profileRoleApi: ProfileRoleAPI = {
  syncLibrary: (ref) => ipcRenderer.invoke("profile-role:syncLibrary", ref),
  previewExpertPreset: (input) => ipcRenderer.invoke("profile-role:previewExpertPreset", input),
  installPreset: (input) => ipcRenderer.invoke("profile-role:installPreset", input),
  listSpecs: () => ipcRenderer.invoke("profile-role:listSpecs"),
  getSpec: (profileId) => ipcRenderer.invoke("profile-role:getSpec", profileId),
  recompile: (profileId) => ipcRenderer.invoke("profile-role:recompile", profileId),
};
