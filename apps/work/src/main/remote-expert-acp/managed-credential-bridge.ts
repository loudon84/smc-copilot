import { ensureFreshAccessToken } from "../auth/ensure-access-token";
import { readStoredSession } from "../auth/token-store";
import { resolveBackendBaseUrl } from "../auth/authorized-backend-transport";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

export interface ManagedCredentialEnv {
  NODESKCLAW_BASE_URL: string;
  NODESKCLAW_CREDENTIAL_MODE: "managed";
  NODESKCLAW_ACCESS_TOKEN: string;
  NODESKCLAW_REFRESH_TOKEN: string;
  NODESKCLAW_ACP_MAX_SESSIONS: string;
}

export async function buildManagedCredentialEnv(): Promise<ManagedCredentialEnv> {
  await ensureFreshAccessToken();
  const session = await readStoredSession();
  const access = session?.accessToken?.trim() ?? "";
  const refresh = session?.refreshToken?.trim() ?? "";
  if (!access || !refresh) {
    throw new RemoteExpertError("REMOTE_AUTH_REQUIRED", "managed credentials missing");
  }
  return {
    NODESKCLAW_BASE_URL: resolveBackendBaseUrl(),
    NODESKCLAW_CREDENTIAL_MODE: "managed",
    NODESKCLAW_ACCESS_TOKEN: access,
    NODESKCLAW_REFRESH_TOKEN: refresh,
    NODESKCLAW_ACP_MAX_SESSIONS: "1",
  };
}

export function overlayManagedEnv(
  parent: NodeJS.ProcessEnv,
  managed: ManagedCredentialEnv,
): NodeJS.ProcessEnv {
  const next = { ...parent, ...managed };
  return next;
}

export function assertArgvHasNoSecrets(argv: string[]): void {
  const joined = argv.join(" ");
  if (/eyJ[A-Za-z0-9_-]{20,}|bearer |refresh_token/i.test(joined)) {
    throw new RemoteExpertError("REMOTE_AUTH_REQUIRED", "token leaked into argv");
  }
}
