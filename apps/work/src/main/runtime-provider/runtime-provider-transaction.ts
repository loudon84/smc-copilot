import {
  clearManagedSecret,
  installManagedSecret,
  readManagedRevision,
  readManagedSecret,
} from "./managed-runtime-secret-store";
import {
  captureManagedFiles,
  captureRewritableSessionOverrides,
  restoreManagedFiles,
  restoreSessionOverrides,
  type ManagedFileSnapshot,
} from "./runtime-provider-projection";

export interface ManagedTransactionSnapshot {
  files: ManagedFileSnapshot;
  overrides: ReturnType<typeof captureRewritableSessionOverrides>;
  memory: { revision: string | null; apiKey: string | null };
  publicStateName: string;
  gateway: { observed: "pre-restart" };
}

export function captureManagedTransaction(
  profile: string | undefined,
  publicStateName: string,
): ManagedTransactionSnapshot {
  return {
    files: captureManagedFiles(profile),
    overrides: captureRewritableSessionOverrides(profile),
    memory: {
      revision: readManagedRevision(profile),
      apiKey: readManagedSecret(profile),
    },
    publicStateName,
    gateway: { observed: "pre-restart" },
  };
}

export function restoreManagedTransaction(
  snapshot: ManagedTransactionSnapshot,
): { ok: true } | { ok: false } {
  try {
    restoreManagedFiles(snapshot.files);
    restoreSessionOverrides(snapshot.overrides);
    if (snapshot.memory.apiKey) {
      installManagedSecret({
        profile: snapshot.files.profile,
        apiKey: snapshot.memory.apiKey,
        revision: snapshot.memory.revision || "",
      });
    } else {
      clearManagedSecret(snapshot.files.profile);
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
