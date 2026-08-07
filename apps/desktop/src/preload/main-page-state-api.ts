import { ipcRenderer } from "electron";
import {
  MainPageStateChannels,
  type MainPagePersistedState,
} from "../shared/shell/main-page-state-contract";

export const mainPageStateApi = {
  read: (): Promise<MainPagePersistedState> =>
    ipcRenderer.invoke(MainPageStateChannels.READ),

  write: (state: MainPagePersistedState): Promise<void> =>
    ipcRenderer.invoke(MainPageStateChannels.WRITE, state),
};
