export function createMockCapabilityServer(
  mode: "native" | "fallback" | "unknown" = "fallback",
) {
  if (mode === "native") {
    return {
      clarify_response: true,
      approval_response: true,
      session_continuation: true,
    };
  }
  if (mode === "unknown") {
    return null;
  }
  return {
    clarify_response: false,
    approval_response: false,
    session_continuation: true,
  };
}
