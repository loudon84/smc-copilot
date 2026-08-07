import { createServer } from "net";
import { listRuntimeInstances, updateRuntimeStatus } from "./profile-runtime-db";
import type { ProfileRuntimeStatus, RuntimeReconcileResult } from "../shared/profile-runtime/profile-runtime-contract";

export async function isPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function reconcile(): Promise<RuntimeReconcileResult> {
  const instances = listRuntimeInstances();
  const corrections: RuntimeReconcileResult["corrections"] = [];

  for (const instance of instances) {
    if (instance.status !== "running" && instance.status !== "starting") {
      continue;
    }

    let correctedStatus: ProfileRuntimeStatus | null = null;
    let reason = "";

    if (instance.pid) {
      const alive = await isProcessAlive(instance.pid);
      if (!alive) {
        correctedStatus = "stopped";
        reason = `Process ${instance.pid} no longer exists`;
      }
    }

    if (!correctedStatus) {
      const portBusy = await isPortOccupied(instance.port);
      if (!portBusy) {
        correctedStatus = "stopped";
        reason = `Port ${instance.port} is not listening`;
      }
    }

    if (correctedStatus) {
      const previousStatus = instance.status;
      updateRuntimeStatus(instance.profile_id, correctedStatus, {
        pid: null,
        stoppedAt: new Date().toISOString(),
      });
      corrections.push({
        profileId: instance.profile_id,
        previousStatus,
        correctedStatus,
        reason,
      });
    }
  }

  return {
    reconciledCount: corrections.length,
    corrections,
  };
}
