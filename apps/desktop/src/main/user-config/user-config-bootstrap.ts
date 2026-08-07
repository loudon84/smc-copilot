import type { BrowserWindow } from "electron";
import type { BootstrapResult } from "../../shared/user-config/user-config-contract";
import { readStoredSession } from "../auth/token-store";
import { refreshPortalView } from "../shell/portal-view-coordinator";
import { applyUserConfig } from "./user-config-applier";
import {
  fetchRemoteBootstrapConfig,
  stashPendingConfig,
} from "./user-config-client";
import { diffBootstrapConfig } from "./user-config-diff";
import {
  readBootstrapState,
  readLocalBootstrapConfig,
  writeBootstrapState,
} from "./user-config-store";

export async function bootstrapUserConfig(
  mainWindow: BrowserWindow | null,
): Promise<BootstrapResult> {
  const state = readBootstrapState();
  const session = await readStoredSession();
  const remote = await fetchRemoteBootstrapConfig(session?.accessToken);

  if (!state.initialized) {
    await applyUserConfig(remote, mainWindow);
    await refreshPortalView();
    return {
      ok: true,
      firstLogin: true,
      applied: true,
      config: remote,
    };
  }

  const local = readLocalBootstrapConfig();
  const diff = diffBootstrapConfig(local, remote);

  if (diff.length > 0) {
    const confirmToken = stashPendingConfig(remote);
    return {
      ok: true,
      firstLogin: false,
      applied: false,
      config: remote,
      diff,
      confirmToken,
    };
  }

  return {
    ok: true,
    firstLogin: false,
    applied: false,
    config: remote,
    diff: [],
  };
}

export async function applyRemoteUserConfig(
  mainWindow: BrowserWindow | null,
  confirmToken?: string,
): Promise<BootstrapResult> {
  const { takePendingConfig } = await import("./user-config-client");
  const remote = confirmToken ? takePendingConfig(confirmToken) : null;
  if (!remote) {
    throw new Error("Invalid or expired confirm token");
  }

  await applyUserConfig(remote, mainWindow);
  await refreshPortalView();
  return {
    ok: true,
    firstLogin: false,
    applied: true,
    config: remote,
  };
}
