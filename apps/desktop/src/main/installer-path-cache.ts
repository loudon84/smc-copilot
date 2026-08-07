import type { ResolvedRuntimePaths } from "./enterprise/windows/path-resolver";
import { resolveRuntimePaths } from "./enterprise/windows/path-resolver";

let _cached: ResolvedRuntimePaths | null = null;

export function getInstallerPaths(): ResolvedRuntimePaths {
  if (!_cached) {
    _cached = resolveRuntimePaths();
  }
  return _cached;
}

export function invalidateInstallerPathCache(): void {
  _cached = null;
}
