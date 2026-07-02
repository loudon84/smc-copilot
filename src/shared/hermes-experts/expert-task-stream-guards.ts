/** Reject Hermes Run SSE URLs; Expert Gateway tasks must use /hermes/tasks/ event streams. */
export function assertNoHermesRunEventStream(eventStream: string): void {
  if (eventStream.includes("/v1/runs/")) {
    throw new Error(`Expert task must not subscribe Hermes Run SSE: ${eventStream}`);
  }

  if (!eventStream.includes("/hermes/tasks/")) {
    throw new Error(`eventSseUrl is not Expert Gateway Task SSE: ${eventStream}`);
  }
}
