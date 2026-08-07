/** Heuristic: tool progress payload may indicate human approval (no Gateway IPC in P2). */
export function toolRequiresApproval(tool: string): boolean {
  const lower = tool.toLowerCase();
  if (
    lower.includes("approval") ||
    lower.includes("approve") ||
    lower.includes("confirm") ||
    lower.includes("human-in-the-loop") ||
    lower.includes("human_in_the_loop")
  ) {
    return true;
  }
  try {
    const parsed = JSON.parse(tool) as Record<string, unknown>;
    if (parsed.requires_approval === true || parsed.requiresApproval === true) {
      return true;
    }
    if (typeof parsed.type === "string" && parsed.type.toLowerCase().includes("approval")) {
      return true;
    }
  } catch {
    /* plain string */
  }
  return false;
}
