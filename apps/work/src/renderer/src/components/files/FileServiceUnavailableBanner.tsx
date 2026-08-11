/**
 * Dev-only banner when File Platform P0 IPC handlers are unavailable.
 */

import { useEffect, useState } from "react";
import type { FilesCapabilities } from "../../../../shared/files";

const HANDLER_LABELS: Array<{
  key: keyof FilesCapabilities["handlers"];
  channel: string;
}> = [
  { key: "listSession", channel: "files:list-session" },
  { key: "getPreview", channel: "files:get-preview" },
  { key: "createFromMessage", channel: "files:create-from-message" },
  { key: "saveAs", channel: "files:save-as" },
  { key: "open", channel: "files:open-external" },
  { key: "reveal", channel: "files:reveal-in-folder" },
];

export function FileServiceUnavailableBanner({
  profile,
}: {
  profile?: string;
}): React.JSX.Element | null {
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void (async () => {
      try {
        const caps = await window.hermesAPI.files.getCapabilities(profile);
        if (cancelled) return;
        if (caps.available !== false && caps.handlers) {
          const absent = HANDLER_LABELS.filter(
            (h) => caps.handlers?.[h.key] !== true,
          ).map((h) => h.channel);
          setMissing(absent);
          return;
        }
        if (caps.available === false) {
          const absent = HANDLER_LABELS.filter(
            (h) => !caps.handlers?.[h.key],
          ).map((h) => h.channel);
          setMissing(
            absent.length
              ? absent
              : HANDLER_LABELS.map((h) => h.channel),
          );
        } else {
          setMissing([]);
        }
      } catch {
        if (!cancelled) {
          setMissing(["files:get-capabilities"]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (!import.meta.env.DEV || missing.length === 0) return null;

  return (
    <div className="file-service-unavailable-banner" role="status">
      File service unavailable:
      <br />
      {missing.map((channel) => (
        <span key={channel}>
          {channel} handler missing
          <br />
        </span>
      ))}
    </div>
  );
}

export default FileServiceUnavailableBanner;
