/**
 * OS-level file operations for the File Preview Panel: open with the
 * default app, reveal in the OS file manager, and Save As a copy.
 */

import { copyFile } from "fs/promises";
import { basename } from "path";
import { BrowserWindow, dialog, shell } from "electron";
import { FilePlatformError } from "./file-security";

/** Open a managed file with the OS default application. */
// @lat: [[file-platform#File operations]]
export async function openExternal(filePath: string): Promise<void> {
  const result = await shell.openPath(filePath);
  if (result) {
    throw FilePlatformError.fromCode(
      "FILE_READ_FAILED",
      "Failed to open file with the default application",
      { detail: result },
    );
  }
}

/** Reveal a managed file in the OS file manager (Explorer/Finder/etc). */
export function revealInFolder(filePath: string): void {
  shell.showItemInFolder(filePath);
}

/**
 * Prompt the user for a destination and copy the managed file there.
 * Returns the chosen path, or null when the user cancels.
 */
export async function saveAs(
  filePath: string,
  suggestedName?: string,
): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const defaultPath = suggestedName || basename(filePath);
  const dialogOpts = { defaultPath };
  const result = win
    ? await dialog.showSaveDialog(win, dialogOpts)
    : await dialog.showSaveDialog(dialogOpts);
  if (result.canceled || !result.filePath) return null;

  try {
    await copyFile(filePath, result.filePath);
  } catch (err) {
    throw FilePlatformError.fromCode(
      "FILE_STORAGE_FAILED",
      "Failed to save a copy of the file",
      { detail: err instanceof Error ? err.message : String(err) },
    );
  }
  return result.filePath;
}
