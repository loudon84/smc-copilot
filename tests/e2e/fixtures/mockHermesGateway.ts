/**
 * Mock Hermes Gateway for Electron E2E (in-memory HTTP-ish behavior).
 */

export type MockCapabilityConfig = {
  clarify_response?: boolean;
  approval_response?: boolean;
  session_continuation?: boolean;
};

export function createMockHermesGateway(caps: MockCapabilityConfig = {}) {
  const events: Array<{ type: string; payload: unknown }> = [];
  return {
    capabilities: {
      clarify_response: caps.clarify_response ?? false,
      approval_response: caps.approval_response ?? false,
      session_continuation: caps.session_continuation ?? true,
    },
    events,
    record(type: string, payload: unknown) {
      events.push({ type, payload });
    },
    reset() {
      events.length = 0;
    },
  };
}
