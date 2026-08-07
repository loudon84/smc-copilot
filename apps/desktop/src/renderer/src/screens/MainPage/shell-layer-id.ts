import type { View } from "../../types/desktop-shell";
import { resolveShellLayerId } from "../../workspace/resolve-workspace";

/** Resolves the ShellView layer id for navigation actions, or null if not a web view tab. */
export function resolveActiveShellLayerId(view: View): string | null {
  return resolveShellLayerId(view);
}
