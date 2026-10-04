import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ACP_ADAPTER_PATH_ENV } from "../../shared/remote-expert-acp/contract";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import type { ContractLockFile } from "./contract-lock";
import { isPackagedApp } from "./remote-expert-feature-gate";

export interface ResolvedAcpBinary {
  exePath: string;
  sha256: string;
  source: "packaged" | "dev-override";
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function resolvePackagedAdapterPath(): string {
  const resources = process.resourcesPath || "";
  return join(resources, "nodeskclaw-acp", "nodeskclaw-acp.exe");
}

export function resolveAcpBinary(input?: {
  packed?: boolean;
  envPath?: string;
  lock?: Pick<ContractLockFile, "adapterBinaryVersion">;
}): ResolvedAcpBinary {
  const packed = input?.packed ?? isPackagedApp();
  const envPath = (input?.envPath ?? process.env[ACP_ADAPTER_PATH_ENV] ?? "").trim();
  if (!packed && envPath) {
    if (!existsSync(envPath)) {
      throw new RemoteExpertError("ACP_BINARY_MISSING", "dev adapter path missing");
    }
    return { exePath: envPath, sha256: hashFile(envPath), source: "dev-override" };
  }
  if (packed && envPath) {
    throw new RemoteExpertError(
      "ACP_BINARY_UNSUPPORTED",
      "production builds ignore adapter path overrides",
    );
  }
  const packaged = resolvePackagedAdapterPath();
  if (!existsSync(packaged)) {
    throw new RemoteExpertError("ACP_BINARY_MISSING", "packaged adapter missing");
  }
  const manifestPath = join(packaged, "..", "distribution-manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      sha256?: string;
      platform?: string;
      arch?: string;
      acp_protocol_version?: number;
      adapter_contract_version?: string;
    };
    const actual = hashFile(packaged);
    if (manifest.sha256 && manifest.sha256.toLowerCase() !== actual) {
      throw new RemoteExpertError("ACP_BINARY_INTEGRITY_FAILED", "adapter sha256 mismatch");
    }
    if (manifest.platform && manifest.platform !== "windows") {
      throw new RemoteExpertError("ACP_BINARY_UNSUPPORTED", "adapter platform unsupported");
    }
    if (manifest.arch && manifest.arch !== "amd64") {
      throw new RemoteExpertError("ACP_BINARY_UNSUPPORTED", "adapter arch unsupported");
    }
    if (manifest.acp_protocol_version != null && manifest.acp_protocol_version !== 1) {
      throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "adapter protocol mismatch");
    }
    return { exePath: packaged, sha256: actual, source: "packaged" };
  }
  return { exePath: packaged, sha256: hashFile(packaged), source: "packaged" };
}
