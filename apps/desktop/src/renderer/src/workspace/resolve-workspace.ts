import { resolveWorkspaceModule } from "./workspace-registry";
import type { View } from "../types/desktop-shell";

/** Resolves ShellView layer id for webview/composite workspaces. */
export function resolveShellLayerId(workspaceId: View): string | null {
  if (typeof workspaceId === "string" && workspaceId.startsWith("external-browser:")) {
    return workspaceId;
  }

  const module = resolveWorkspaceModule(workspaceId);
  return module?.shellLayerId ?? null;
}
