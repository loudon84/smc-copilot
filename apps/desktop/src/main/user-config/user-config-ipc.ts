import { ipcMain, type BrowserWindow } from "electron";
import { bootstrapUserConfig, applyRemoteUserConfig } from "./user-config-bootstrap";
import { fetchRemoteBootstrapConfig } from "./user-config-client";
import { diffBootstrapConfig } from "./user-config-diff";
import { readBootstrapState, readLocalBootstrapConfig } from "./user-config-store";
import { readStoredSession } from "../auth/token-store";

export function registerUserConfigIpc(mainWindow: BrowserWindow | null): void {
  ipcMain.handle("user-config:get-local", () => readLocalBootstrapConfig());

  ipcMain.handle("user-config:get-bootstrap-state", () => readBootstrapState());

  ipcMain.handle("user-config:fetch-remote", async () => {
    const session = await readStoredSession();
    return fetchRemoteBootstrapConfig(session?.accessToken);
  });

  ipcMain.handle("user-config:bootstrap", async () => bootstrapUserConfig(mainWindow));

  ipcMain.handle("user-config:diff-remote", async () => {
    const local = readLocalBootstrapConfig();
    const session = await readStoredSession();
    const remote = await fetchRemoteBootstrapConfig(session?.accessToken);
    return diffBootstrapConfig(local, remote);
  });

  ipcMain.handle("user-config:apply-remote", async (_, confirmToken?: string) =>
    applyRemoteUserConfig(mainWindow, confirmToken),
  );
}
