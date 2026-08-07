import { useEffect, useState, useCallback } from "react";
import type { UpdateState } from "../types/desktop-shell";

export interface UseUpdateStateResult {
  updateVersion: string | null;
  updateState: UpdateState;
  downloadPercent: number;
  updateError: string | null;
  handleUpdate: () => Promise<void>;
}

export function useUpdateState(): UseUpdateStateResult {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    const cleanupAvailable = window.hermesAPI.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
      setUpdateState("available");
    });
    const cleanupProgress = window.hermesAPI.onUpdateDownloadProgress((info) => {
      setDownloadPercent(info.percent);
      setUpdateState("downloading");
    });
    const cleanupDownloaded = window.hermesAPI.onUpdateDownloaded(() => {
      setUpdateState("ready");
    });
    const cleanupError = window.hermesAPI.onUpdateError((message) => {
      setUpdateError(message);
      setUpdateState(null);
    });
    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
      cleanupError?.();
    };
  }, []);

  const handleUpdate = useCallback(async (): Promise<void> => {
    if (updateState === "available") {
      setUpdateState("downloading");
      await window.hermesAPI.downloadUpdate();
    } else if (updateState === "ready") {
      await window.hermesAPI.installUpdate();
    }
  }, [updateState]);

  return {
    updateVersion,
    updateState,
    downloadPercent,
    updateError,
    handleUpdate,
  };
}
