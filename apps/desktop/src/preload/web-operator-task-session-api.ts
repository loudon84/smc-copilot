import { ipcRenderer } from "electron";
import type {
  WebOperatorTaskSessionAPI,
  WebOperatorTaskSessionPrepareNewInput,
  WebOperatorTaskSessionResolveInput,
  WebOperatorTaskSessionUpsertInput,
} from "../shared/web-operator/web-operator-task-session-contract";

export const webOperatorTaskSessionApi: WebOperatorTaskSessionAPI = {
  resolve(input: WebOperatorTaskSessionResolveInput) {
    return ipcRenderer.invoke("web-operator-task-session:resolve", input);
  },
  upsert(input: WebOperatorTaskSessionUpsertInput) {
    return ipcRenderer.invoke("web-operator-task-session:upsert", input);
  },
  prepareNewSession(input: WebOperatorTaskSessionPrepareNewInput) {
    return ipcRenderer.invoke("web-operator-task-session:prepare-new", input);
  },
  remove(taskId: string) {
    return ipcRenderer.invoke("web-operator-task-session:remove", taskId);
  },
  getLastActive() {
    return ipcRenderer.invoke("web-operator-task-session:get-last-active");
  },
};
