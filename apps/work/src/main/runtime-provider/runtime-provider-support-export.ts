import { closeSync, lstatSync, openSync, readFileSync, unlinkSync, writeSync } from "fs";
import { readDiagnosticHistory } from "./runtime-provider-diagnostics-history";
import {
  assembleRuntimeProviderDiagnostics,
  getRuntimeProviderDiagnostics,
} from "./runtime-provider-diagnostics";
import { SUPPORT_BUNDLE_MAX_BYTES } from "../../shared/runtime-provider-diagnostics";

export interface SupportBundleProduct {
  name: string;
  appVersion: string;
  platform: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
  runtimeAdapter: string | null;
  runtimeContract: string | null;
  hermesVersion: string | null;
}

export function buildSupportBundle(input: {
  profile?: string;
  product: SupportBundleProduct;
  generatedAt: string;
}): { text: string; snapshotProfile: string } {
  const loaded = getRuntimeProviderDiagnostics(input.profile);
  if (!loaded.ok) throw new Error(loaded.error);
  let history = readDiagnosticHistory();
  const render = (events: Array<Record<string, unknown>>) =>
    `${JSON.stringify({
      schemaVersion: "1.0",
      generatedAt: input.generatedAt,
      product: input.product,
      snapshot: loaded.snapshot,
      history: events,
    })}\n`;
  let text = render(history);
  while (Buffer.byteLength(text, "utf8") > SUPPORT_BUNDLE_MAX_BYTES && history.length > 0) {
    history = history.slice(1);
    text = render(history);
  }
  return { text, snapshotProfile: loaded.snapshot.profile };
}

export async function exportRuntimeProviderDiagnostics(input: {
  profile?: string;
  product: SupportBundleProduct;
  choosePath: (
    defaultName: string,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  now?: Date;
}): Promise<
  | { ok: true; path: string }
  | { ok: false; error: string }
> {
  const now = input.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const defaultName = `smc-copilot-runtime-diagnostics-${stamp.slice(0, 15)}.json`;
  const choice = await input.choosePath(defaultName);
  if (choice.canceled || !choice.filePath) return { ok: false, error: "CANCELLED" };
  const target = choice.filePath;
  try {
    lstatSync(target);
    return { ok: false, error: "DIAGNOSTICS_EXPORT_TARGET_EXISTS" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: "DIAGNOSTICS_EXPORT_FAILED" };
    }
  }
  let handle: number | null = null;
  try {
    const built = buildSupportBundle({
      profile: input.profile,
      product: input.product,
      generatedAt: now.toISOString(),
    });
    JSON.parse(built.text);
    handle = openSync(target, "wx");
    writeSync(handle, built.text);
    closeSync(handle);
    handle = null;
    JSON.parse(readFileSync(target, "utf8"));
    return { ok: true, path: target };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { ok: false, error: "DIAGNOSTICS_EXPORT_TARGET_EXISTS" };
    }
    if (handle !== null) {
      try {
        closeSync(handle);
      } catch {
        /* close is part of cleanup */
      }
    }
    try {
      unlinkSync(target);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        return { ok: false, error: "DIAGNOSTICS_EXPORT_CLEANUP_FAILED" };
      }
    }
    return { ok: false, error: "DIAGNOSTICS_EXPORT_FAILED" };
  }
}

export function currentRuntimeProduct(): SupportBundleProduct {
  return {
    name: "smc-copilot",
    appVersion: process.env.npm_package_version || "0.0.0",
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron || "",
    nodeVersion: process.versions.node,
    runtimeAdapter: null,
    runtimeContract: null,
    hermesVersion: null,
  };
}

export { assembleRuntimeProviderDiagnostics };
