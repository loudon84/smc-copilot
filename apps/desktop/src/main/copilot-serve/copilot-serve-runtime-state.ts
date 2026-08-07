/** Shared copilot-serve child PID (avoids circular import between process and preflight). */
let managedPid: number | null = null;

export function setCopilotServeManagedPid(pid: number | null): void {
  managedPid = pid;
}

export function getCopilotServeManagedPid(): number | null {
  return managedPid;
}
