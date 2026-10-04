import { spawn } from "child_process";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import type { ContractLockFile } from "./contract-lock";
import { hiddenSubprocessOptions } from "../process-options";

export interface AdapterVersionOutput {
  adapterVersion: string;
  protocolVersion: number;
  adapterContractVersion: string;
  adapterContractDigest: string;
  remoteAgentContractVersion: string;
  remoteAgentContractDigest: string;
}

export async function probeAdapterVersion(
  exePath: string,
  timeoutMs = 8_000,
): Promise<AdapterVersionOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      exePath,
      ["version"],
      hiddenSubprocessOptions({ stdio: ["ignore", "pipe", "pipe"], windowsHide: true }),
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new RemoteExpertError("ACP_ADAPTER_VERSION_UNREADABLE", "version probe timed out"),
      );
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new RemoteExpertError("ACP_ADAPTER_VERSION_UNREADABLE", String(err.message)),
      );
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim()) as AdapterVersionOutput;
        if (
          typeof parsed.adapterVersion !== "string" ||
          typeof parsed.adapterContractVersion !== "string" ||
          typeof parsed.adapterContractDigest !== "string"
        ) {
          throw new Error("schema");
        }
        resolve(parsed);
      } catch {
        void stderr;
        reject(
          new RemoteExpertError("ACP_ADAPTER_VERSION_UNREADABLE", "version output invalid"),
        );
      }
    });
  });
}

export function assertAdapterCompatible(
  version: AdapterVersionOutput,
  lock: ContractLockFile,
): void {
  if (Number(version.protocolVersion) !== lock.protocolVersion) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "protocolVersion mismatch");
  }
  if (version.adapterContractVersion !== lock.components.acpAdapter.version) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "adapter contract version mismatch");
  }
  if (version.adapterContractDigest !== lock.components.acpAdapter.consumerDigest) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "adapter digest mismatch");
  }
  if (version.remoteAgentContractDigest !== lock.components.remoteAgent.consumerDigest) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "remote agent digest mismatch");
  }
  if (version.adapterVersion !== lock.adapterBinaryVersion) {
    throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "adapter binary version mismatch");
  }
}
