import { ipcRenderer } from "electron";
import {
  CHAT_WORKSPACE_CHANNELS,
  DEFAULT_CHAT_WORKSPACE_ID,
  type ChatWorkspaceCloseRunInput,
  type ChatWorkspaceMigrateV1Input,
  type ChatWorkspaceOpenInput,
  type ChatWorkspaceOpenSessionInput,
  type ChatWorkspaceOpenSessionResult,
  type ChatWorkspacePatchRunInput,
  type ChatWorkspaceReorderInput,
  type ChatWorkspaceSetActiveInput,
  type ChatWorkspaceSnapshot,
  type ChatWorkspaceRunRow,
} from "../shared/chat-workspace/chat-workspace-contract";

// @lat: [[domain/chat#Workspace persistence]]
export const chatWorkspaceApi = {
  getSnapshot(workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.getSnapshot, workspaceId);
  },

  list(workspaceId: string = DEFAULT_CHAT_WORKSPACE_ID): Promise<ChatWorkspaceRunRow[]> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.list, workspaceId);
  },

  open(input: ChatWorkspaceOpenInput): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.open, input);
  },

  openSession(
    input: ChatWorkspaceOpenSessionInput,
  ): Promise<ChatWorkspaceOpenSessionResult & { snapshot: ChatWorkspaceSnapshot }> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.openSession, input);
  },

  patchRun(input: ChatWorkspacePatchRunInput): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.patchRun, input);
  },

  closeRun(input: ChatWorkspaceCloseRunInput): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.closeRun, input);
  },

  setActive(input: ChatWorkspaceSetActiveInput): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.setActive, input);
  },

  reorder(input: ChatWorkspaceReorderInput): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.reorder, input);
  },

  migrateV1(input: ChatWorkspaceMigrateV1Input): Promise<ChatWorkspaceSnapshot> {
    return ipcRenderer.invoke(CHAT_WORKSPACE_CHANNELS.migrateV1, input);
  },

  onChanged(callback: (snapshot: ChatWorkspaceSnapshot) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      snapshot: ChatWorkspaceSnapshot,
    ): void => {
      callback(snapshot);
    };
    ipcRenderer.on(CHAT_WORKSPACE_CHANNELS.changed, listener);
    return () =>
      ipcRenderer.removeListener(CHAT_WORKSPACE_CHANNELS.changed, listener);
  },
};
