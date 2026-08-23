/**
 * Dev / local UI escape hatch: skip Startup Gate blocking on Runtime :8765.
 *
 * Set `SMC_DESKTOP_SKIP_RUNTIME=true` (scripts/dev.cjs defaults this on).
 * Set `=false` to restore strict Runtime-required boot.
 */
export function isSkipRuntimeConnectionGate(): boolean {
  return process.env.SMC_DESKTOP_SKIP_RUNTIME === "true";
}
