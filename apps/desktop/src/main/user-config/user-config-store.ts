import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type {
  BootstrapState,
  DesktopBootstrapConfig,
} from "../../shared/user-config/user-config-contract";
import { normalizeBootstrapConfig } from "../../shared/user-config/user-config-normalize";

const USER_CONFIG_DIR = join(app.getPath("userData"), "user-config");
const BOOTSTRAP_STATE_FILE = join(USER_CONFIG_DIR, "bootstrap-state.json");
const LOCAL_CONFIG_FILE = join(USER_CONFIG_DIR, "bootstrap-config.json");

export function readBootstrapState(): BootstrapState {
  if (!existsSync(BOOTSTRAP_STATE_FILE)) {
    return {
      initialized: false,
      lastConfigHash: null,
      lastConfigVersion: null,
      lastAppliedAt: null,
    };
  }
  return JSON.parse(readFileSync(BOOTSTRAP_STATE_FILE, "utf-8")) as BootstrapState;
}

export function writeBootstrapState(state: BootstrapState): void {
  mkdirSync(dirname(BOOTSTRAP_STATE_FILE), { recursive: true });
  writeFileSync(BOOTSTRAP_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function readLocalBootstrapConfig(): DesktopBootstrapConfig | null {
  if (!existsSync(LOCAL_CONFIG_FILE)) return null;
  const raw = JSON.parse(readFileSync(LOCAL_CONFIG_FILE, "utf-8")) as DesktopBootstrapConfig;
  return normalizeBootstrapConfig(raw);
}

export function writeLocalBootstrapConfig(config: DesktopBootstrapConfig): void {
  const normalized = normalizeBootstrapConfig(config);
  mkdirSync(dirname(LOCAL_CONFIG_FILE), { recursive: true });
  writeFileSync(LOCAL_CONFIG_FILE, JSON.stringify(normalized, null, 2), "utf-8");
}
