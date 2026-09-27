import {
  AuthorizedBackendTransportError,
  createAuthorizedBackendTransport,
  type AuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import {
  BOOTSTRAP_REQUEST_BODY,
  RUNTIME_BOOTSTRAP_PATH,
  parseRuntimeBootstrap,
  type RuntimeBootstrapContract,
  type RuntimeBootstrapErrorCode,
} from "./runtime-provider-contract";

export type FetchRuntimeBootstrapResult =
  | { ok: true; contract: RuntimeBootstrapContract }
  | { ok: false; error: RuntimeBootstrapErrorCode };

export async function fetchRuntimeBootstrap(
  transport: AuthorizedBackendTransport = createAuthorizedBackendTransport(),
): Promise<FetchRuntimeBootstrapResult> {
  let response: Response;
  try {
    response = await transport.withAuthRetry(async () => {
      const next = await transport.authorizedFetch(RUNTIME_BOOTSTRAP_PATH, {
        method: "POST",
        body: JSON.stringify(BOOTSTRAP_REQUEST_BODY),
      });
      if (next.status === 401 || next.status === 403) {
        throw new AuthorizedBackendTransportError("Runtime bootstrap unauthorized", {
          status: next.status,
          errorCode: "UNAUTHORIZED",
        });
      }
      return next;
    });
  } catch (err) {
    if (
      err instanceof AuthorizedBackendTransportError &&
      (err.status === 401 || err.status === 403)
    ) {
      return { ok: false, error: "RUNTIME_BOOTSTRAP_UNAUTHORIZED" };
    }
    return { ok: false, error: "RUNTIME_BOOTSTRAP_UNAVAILABLE" };
  }
  if (!response.ok) {
    return { ok: false, error: "RUNTIME_BOOTSTRAP_UNAVAILABLE" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
  }
  const parsed = parseRuntimeBootstrap(body);
  if (!parsed.ok) return parsed;
  return { ok: true, contract: parsed.contract };
}
