import { ipcMain } from "electron";
import {
  MainPageStateChannels,
  type MainPagePersistedState,
} from "../../shared/shell/main-page-state-contract";
import {
  readMainPageState,
  writeMainPageState,
} from "./main-page-state-store";

export function registerMainPageStateIpc(): void {
  ipcMain.handle(MainPageStateChannels.READ, (): MainPagePersistedState => {
    return readMainPageState();
  });

  ipcMain.handle(
    MainPageStateChannels.WRITE,
    (_event, state: MainPagePersistedState): void => {
      if (!state || state.version !== 2) {
        throw new Error("Invalid main page state: version must be 2");
      }
      writeMainPageState(state);
    },
  );

  console.log("[MAIN-PAGE] Main page state IPC registered");
}
