/**
 * Map Serve (server UUID) event identity onto Desktop client run/turn ids.
 * Renderer filters strictly on client identities from chat-runtime:start.
 */
export function remapServeEventIdentity<T extends { runId?: string; turnId?: string }>(
  event: T,
  identity: {
    clientRunId: string;
    clientTurnId: string;
    serverRunId: string;
    serverTurnId: string;
  },
): T & { runId: string; turnId: string } {
  const rawTurnId = event.turnId || identity.serverTurnId;
  const clientTurnId =
    !rawTurnId ||
    rawTurnId === identity.serverTurnId ||
    rawTurnId === identity.clientTurnId
      ? identity.clientTurnId
      : rawTurnId;
  return {
    ...event,
    runId: identity.clientRunId,
    turnId: clientTurnId,
  };
}
