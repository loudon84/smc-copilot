import type { ConnectionConfig } from "../config";
import { getFullConnectionConfig, setConnectionConfig } from "../config";
import type {
  BootstrapState,
  DesktopBootstrapConfig,
} from "../../shared/user-config/user-config-contract";
import {
  readBootstrapState,
  readLocalBootstrapConfig,
  writeBootstrapState,
  writeLocalBootstrapConfig,
} from "./user-config-store";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { app } from "electron";

const LOCAL_CONFIG_FILE = join(app.getPath("userData"), "user-config", "bootstrap-config.json");

export interface ApplySnapshot {
  localConfig: DesktopBootstrapConfig | null;
  bootstrapState: BootstrapState;
  connection: ConnectionConfig;
}

export function captureApplySnapshot(): ApplySnapshot {
  return {
    localConfig: readLocalBootstrapConfig(),
    bootstrapState: readBootstrapState(),
    connection: getFullConnectionConfig(),
  };
}

export function restoreApplySnapshot(snapshot: ApplySnapshot): void {
  setConnectionConfig(snapshot.connection);
  writeBootstrapState(snapshot.bootstrapState);

  if (snapshot.localConfig) {
    writeLocalBootstrapConfig(snapshot.localConfig);
  } else if (existsSync(LOCAL_CONFIG_FILE)) {
    try {
      unlinkSync(LOCAL_CONFIG_FILE);
    } catch {
      /* ignore */
    }
  }
}
