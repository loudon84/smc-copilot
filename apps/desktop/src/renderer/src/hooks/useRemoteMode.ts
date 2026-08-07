import { useEffect, useState } from "react";
import type { View } from "../types/desktop-shell";

export function useRemoteMode(view: View): boolean {
  const [remoteMode, setRemoteMode] = useState(false);

  useEffect(() => {
    window.hermesAPI.isRemoteOnlyMode().then(setRemoteMode).catch(() => {});
  }, [view]);

  return remoteMode;
}
