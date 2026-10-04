import type { RemoteExpertPermissionOption } from "../../shared/remote-expert-acp/events";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

const pending = new Map<
  string,
  { optionId?: RemoteExpertPermissionOption; rpcId: string | number }
>();

export function rememberPermissionRequest(requestId: string, rpcId: string | number): void {
  pending.set(requestId, { rpcId });
}

export function peekPermissionRequest(
  requestId: string,
): { rpcId: string | number; resolved: boolean } | undefined {
  const current = pending.get(requestId);
  if (!current) return undefined;
  return { rpcId: current.rpcId, resolved: Boolean(current.optionId) };
}

export function markPermissionResolved(
  requestId: string,
  optionId: RemoteExpertPermissionOption,
): void {
  const current = pending.get(requestId);
  if (!current) {
    throw new RemoteExpertError(
      "ACP_PERMISSION_ALREADY_RESOLVED",
      "permission request missing",
    );
  }
  current.optionId = optionId;
}

export function resolvePermissionOnce(
  requestId: string,
  optionId: RemoteExpertPermissionOption,
): { rpcId: string | number } {
  const current = pending.get(requestId);
  if (!current || current.optionId) {
    throw new RemoteExpertError(
      "ACP_PERMISSION_ALREADY_RESOLVED",
      "permission already resolved",
    );
  }
  current.optionId = optionId;
  pending.set(requestId, current);
  return { rpcId: current.rpcId };
}

export function forgetPermission(requestId: string): void {
  pending.delete(requestId);
}
