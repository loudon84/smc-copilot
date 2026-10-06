import {
  discoveryExactMatch,
  RemoteExpertError,
  type ContractGateState,
  type RemoteExpertDiscovery,
} from "../../shared/remote-expert";
import { resolveBackendBaseUrl } from "../auth/authorized-backend-transport";

const DISCOVERY_PATH = "/api/v1/remote-experts/contracts";

let cached: { state: ContractGateState; discovery?: RemoteExpertDiscovery } = {
  state: "UNRESOLVED",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseDiscovery(body: unknown): RemoteExpertDiscovery {
  if (!isRecord(body)) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "discovery is not an object",
    );
  }
  const fields: Array<keyof RemoteExpertDiscovery> = [
    "frontendContractVersion",
    "frontendContractDigest",
    "catalogContractVersion",
    "catalogContractDigest",
    "remoteAcpContractVersion",
    "remoteAcpContractDigest",
    "acpProtocolVersion",
    "transportProfile",
  ];
  for (const field of fields) {
    if (!(field in body)) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
        `discovery missing ${field}`,
      );
    }
  }
  return {
    frontendContractVersion: String(body.frontendContractVersion),
    frontendContractDigest: String(body.frontendContractDigest),
    catalogContractVersion: String(body.catalogContractVersion),
    catalogContractDigest: String(body.catalogContractDigest),
    remoteAcpContractVersion: String(body.remoteAcpContractVersion),
    remoteAcpContractDigest: String(body.remoteAcpContractDigest),
    acpProtocolVersion: Number(body.acpProtocolVersion),
    transportProfile: String(body.transportProfile),
  };
}

export function getContractGateState(): ContractGateState {
  return cached.state;
}

export function resetContractGate(): void {
  cached = { state: "UNRESOLVED" };
}

export async function ensureCompatibleContract(options?: {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): Promise<RemoteExpertDiscovery> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const base = options?.baseUrl ?? resolveBackendBaseUrl();
  let res: Response;
  try {
    res = await fetchImpl(new URL(DISCOVERY_PATH, base).toString(), {
      method: "GET",
    });
  } catch {
    cached = { state: "UNRESOLVED" };
    throw new RemoteExpertError(
      "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
      "contract discovery unavailable",
      { retryable: true },
    );
  }
  if (!res.ok) {
    cached = { state: "UNRESOLVED" };
    throw new RemoteExpertError(
      "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
      `discovery HTTP ${res.status}`,
      { retryable: true },
    );
  }
  const discovery = parseDiscovery(await res.json());
  cached = { state: "DISCOVERED", discovery };
  if (!discoveryExactMatch(discovery)) {
    cached = { state: "INCOMPATIBLE", discovery };
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      "provider discovery does not match pinned consumer lock",
    );
  }
  cached = { state: "COMPATIBLE", discovery };
  return discovery;
}

export function assertCompatibleOrThrow(): void {
  if (cached.state !== "COMPATIBLE") {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
      `contract gate is ${cached.state}`,
    );
  }
}
