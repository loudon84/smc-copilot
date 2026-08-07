import { EventEmitter } from "events";
import { ipcMain } from "electron";
import type { ShellViewManager } from "./views/shell-view-manager";
import type {
  ShellViewBoundsIPC,
  ShellViewCreateRequest,
  ShellViewLoadUrlRequest,
} from "../../shared/shell/shell-view-contract";
import { ShellViewChannels } from "../../shared/shell/shell-view-contract";
import { BROWSER_PARTITION } from "../browser/browser-types";
import { bindShellViewManager, refreshPortalView } from "./portal-view-coordinator";
import { viewEventBus } from "./views/view-events";

async function ensurePortalView(svm: ShellViewManager): Promise<void> {
  bindShellViewManager(svm);
  await refreshPortalView();
}

async function ensureWebOperatorView(svm: ShellViewManager): Promise<void> {
  const url = "about:blank";
  const existing = svm.getView("web-operator");

  if (!existing) {
    await svm.createView("web-operator", "web-operator", url, {
      layer: "content",
      partition: BROWSER_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
    });
    console.log("[SHELL-IPC] Lazy created web-operator view");
  }
}

async function ensureKnownView(svm: ShellViewManager, layerId: string): Promise<void> {
  if (layerId === "portal") {
    await ensurePortalView(svm);
    return;
  }

  if (layerId === "web-operator") {
    await ensureWebOperatorView(svm);
    return;
  }

  if (!svm.getView(layerId)) {
    throw new Error(`Layer not found: ${layerId}`);
  }
}

export function registerShellViewIpc(svm: ShellViewManager): void {
  ipcMain.handle(
    ShellViewChannels.CREATE,
    async (_event, request: ShellViewCreateRequest): Promise<void> => {
      if (!request?.layerId || typeof request.layerId !== "string") {
        throw new Error(`Invalid layerId: ${request?.layerId}`);
      }
      if (!request?.kind || typeof request.kind !== "string") {
        throw new Error(`Invalid kind: ${request?.kind}`);
      }
      if (!request?.url || typeof request.url !== "string") {
        throw new Error(`Invalid url: ${request?.url}`);
      }

      await svm.createView(
        request.layerId,
        request.kind,
        request.url,
        request.options,
      );
    },
  );

  ipcMain.handle(
    ShellViewChannels.ACTIVATE,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      await ensureKnownView(svm, layerId);
      svm.activateView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.SET_BOUNDS,
    async (
      _event,
      layerId: string,
      bounds: ShellViewBoundsIPC,
    ): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }
      if (
        !bounds ||
        typeof bounds.x !== "number" ||
        typeof bounds.y !== "number" ||
        typeof bounds.width !== "number" ||
        typeof bounds.height !== "number" ||
        bounds.width < 1 ||
        bounds.height < 1
      ) {
        throw new Error(
          "Invalid bounds: x/y must be numbers, width/height must be positive integers",
        );
      }

      await ensureKnownView(svm, layerId);
      svm.activateView(layerId, bounds);
    },
  );

  ipcMain.handle(
    ShellViewChannels.LOAD_URL,
    async (_event, request: ShellViewLoadUrlRequest): Promise<void> => {
      if (!request?.layerId || typeof request.layerId !== "string") {
        throw new Error(`Invalid layerId: ${request?.layerId}`);
      }
      if (!request?.url || typeof request.url !== "string") {
        throw new Error(`Invalid url: ${request?.url}`);
      }

      await ensureKnownView(svm, request.layerId);
      await svm.loadUrl(request.layerId, request.url);

      const lastBounds = svm.getLastActivationBounds(request.layerId);
      if (lastBounds) {
        svm.activateView(request.layerId, lastBounds);
      }
    },
  );

  ipcMain.handle(
    ShellViewChannels.FOCUS,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      await ensureKnownView(svm, layerId);
      svm.focusView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.HIDE,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      svm.deactivateView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.DESTROY,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      svm.destroyView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.GET_STATE,
    async (_event, layerId: string) => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }

      // Lazy-create known shell layers (getState alone used to return null forever).
      if (layerId === "portal" || layerId === "web-operator") {
        await ensureKnownView(svm, layerId);
      }

      return svm.getViewSnapshot(layerId);
    },
  );

  ipcMain.handle(ShellViewChannels.GET_ALL, async () => {
    return svm.getAllViewSnapshots();
  });

  ipcMain.handle(
    ShellViewChannels.RELOAD,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }
      await ensureKnownView(svm, layerId);
      svm.reloadView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.STOP_LOADING,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }
      await ensureKnownView(svm, layerId);
      svm.stopLoadingView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.GO_BACK,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }
      await ensureKnownView(svm, layerId);
      svm.goBackView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.GO_FORWARD,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }
      await ensureKnownView(svm, layerId);
      svm.goForwardView(layerId);
    },
  );

  ipcMain.handle(
    ShellViewChannels.RECOVER,
    async (_event, layerId: string): Promise<void> => {
      if (!layerId || typeof layerId !== "string") {
        throw new Error(`Invalid layerId: ${layerId}`);
      }
      await svm.recoverView(layerId);
    },
  );

  console.log("[SHELL-IPC] ShellView IPC handlers registered");
}

export function destroyShellViews(): void {
  try {
    void (viewEventBus as EventEmitter).emit("destroy-all");
  } catch {
    /* best effort */
  }
}
