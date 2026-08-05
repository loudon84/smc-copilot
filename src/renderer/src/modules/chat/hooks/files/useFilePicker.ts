import { useCallback, useRef, useState } from "react";
import type {
  FileImportContext,
  FileImportResult,
  FilePickerOptions,
} from "@shared/chat-files";

export type FilePickerPickResult =
  /** `hermesAPI.files.pickFiles` ran — results are File Platform imports
   * (staged/hashed on Main; no renderer byte access needed). */
  | { source: "managed"; results: FileImportResult[] }
  /** Fallback hidden `<input type="file">` — plain browser `File[]`, the
   * shape `attachmentUtils.processFiles` already knows how to ingest. */
  | { source: "raw"; files: File[] };

export interface UseFilePickerOptions {
  /** Import context for the managed picker. Omit to always use the hidden
   * `<input>` fallback (e.g. the composer's legacy Attachment flow, which
   * needs real file bytes rather than a ManagedFileView). */
  context?: FileImportContext;
  pickerOptions?: FilePickerOptions;
  /** `accept` attribute for the hidden-input fallback. */
  accept?: string;
  multiple?: boolean;
}

export interface UseFilePickerResult {
  pick: () => Promise<FilePickerPickResult>;
  picking: boolean;
}

function pickViaHiddenInput(accept?: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept) input.accept = accept;
    input.style.display = "none";

    let settled = false;
    const finish = (files: File[]): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onWindowFocus, true);
      input.remove();
      resolve(files);
    };

    input.addEventListener(
      "change",
      () => finish(input.files ? Array.from(input.files) : []),
      { once: true },
    );
    // Dialog cancellation fires no `change` event — resolve empty once the
    // window regains focus (the dialog closing) so `picking` doesn't hang.
    const onWindowFocus = (): void => {
      setTimeout(() => finish(input.files ? Array.from(input.files) : []), 300);
    };
    window.addEventListener("focus", onWindowFocus, true);

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Opens the native "managed" file dialog via `hermesAPI.files.pickFiles`
 * when an import `context` is supplied, otherwise falls back to a hidden
 * `<input type="file">` — the same mechanism the composer's paperclip
 * button already uses, kept intact for the legacy `Attachment` send path.
 */
export function useFilePicker(
  options: UseFilePickerOptions = {},
): UseFilePickerResult {
  const [picking, setPicking] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const pick = useCallback(async (): Promise<FilePickerPickResult> => {
    const { context, pickerOptions, accept, multiple } = optionsRef.current;
    setPicking(true);
    try {
      const filesApi = window.hermesAPI?.files;
      if (context && filesApi?.pickFiles) {
        const results = await filesApi.pickFiles(pickerOptions, context);
        return { source: "managed", results };
      }
      const files = await pickViaHiddenInput(accept, multiple !== false);
      return { source: "raw", files };
    } finally {
      setPicking(false);
    }
  }, []);

  return { pick, picking };
}

export default useFilePicker;
