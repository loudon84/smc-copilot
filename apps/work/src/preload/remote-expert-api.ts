import { ipcRenderer } from "electron";
import {
  REMOTE_EXPERT_IPC_CHANNELS,
  type RemoteExpertApi,
} from "../shared/remote-expert-acp/ipc";
import type { RemoteExpertSemanticEvent } from "../shared/remote-expert-acp/events";

export function createRemoteExpertApi(): RemoteExpertApi {
  return {
    getAvailability: () => ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.GET_AVAILABILITY),
    listCatalog: () => ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.LIST_CATALOG),
    getBinding: (sessionId) =>
      ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.GET_BINDING, sessionId),
    submit: (input) => ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.SUBMIT, input),
    cancel: (input) => ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.CANCEL, input),
    close: (input) => ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.CLOSE, input),
    resume: (input) => ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.RESUME, input),
    decidePermission: (input) =>
      ipcRenderer.invoke(REMOTE_EXPERT_IPC_CHANNELS.DECIDE_PERMISSION, input),
    onEvent: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: RemoteExpertSemanticEvent,
      ) => {
        listener(payload);
      };
      ipcRenderer.on(REMOTE_EXPERT_IPC_CHANNELS.ON_EVENT, wrapped);
      return () => {
        ipcRenderer.removeListener(REMOTE_EXPERT_IPC_CHANNELS.ON_EVENT, wrapped);
      };
    },
  };
}
