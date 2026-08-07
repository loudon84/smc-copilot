import type { BrowserWindow } from "electron";
import {
  ShellViewEvents,
  type ShellViewCrashedEvent,
  type ShellViewLoadFailedEvent,
  type ShellViewMetadataChangedEvent,
} from "../../shared/shell/shell-view-contract";
import { viewEventBus } from "./views/view-events";

export function bindShellViewEventForwarder(
  mainWindow: BrowserWindow,
): () => void {
  const send = (channel: string, payload: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  const onMetadataChanged = (payload: {
    snapshot: ShellViewMetadataChangedEvent["snapshot"];
  }): void => {
    send(ShellViewEvents.METADATA_CHANGED, {
      snapshot: payload.snapshot,
    } satisfies ShellViewMetadataChangedEvent);
  };

  const onLoadFailed = (payload: {
    id: string;
    url: string;
    errorCode: number;
    errorDescription: string;
  }): void => {
    send(ShellViewEvents.LOAD_FAILED, {
      id: payload.id,
      url: payload.url,
      errorCode: payload.errorCode,
      errorDescription: payload.errorDescription,
    } satisfies ShellViewLoadFailedEvent);
  };

  const onCrashed = (payload: {
    id: string;
    reason: string;
    exitCode: number;
  }): void => {
    send(ShellViewEvents.CRASHED, {
      id: payload.id,
      reason: payload.reason,
      exitCode: payload.exitCode,
    } satisfies ShellViewCrashedEvent);
  };

  viewEventBus.on("view:metadata-changed", onMetadataChanged);
  viewEventBus.on("view:load-failed", onLoadFailed);
  viewEventBus.on("view:crashed", onCrashed);

  return () => {
    viewEventBus.off("view:metadata-changed", onMetadataChanged);
    viewEventBus.off("view:load-failed", onLoadFailed);
    viewEventBus.off("view:crashed", onCrashed);
  };
}
