import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import { hiddenSubprocessOptions } from "../process-options";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import { redactDiagnosticsText } from "./diagnostics";

export interface AcpProcessHandle {
  sessionKey: string;
  pid: number | undefined;
  child: ChildProcessWithoutNullStreams;
  stdout: EventEmitter;
}

const processes = new Map<string, Promise<AcpProcessHandle>>();
const live = new Map<string, AcpProcessHandle>();

export function getLiveAcpProcess(sessionKey: string): AcpProcessHandle | undefined {
  return live.get(sessionKey);
}

export function listLiveAcpPids(): number[] {
  return [...live.values()].map((p) => p.pid).filter((pid): pid is number => typeof pid === "number");
}

export async function ensureAcpProcess(input: {
  sessionKey: string;
  exePath: string;
  profilePath: string;
  env: NodeJS.ProcessEnv;
}): Promise<AcpProcessHandle> {
  const existing = processes.get(input.sessionKey);
  if (existing) return existing;
  const started = startProcess(input);
  processes.set(input.sessionKey, started);
  try {
    return await started;
  } catch (err) {
    processes.delete(input.sessionKey);
    throw err;
  }
}

async function startProcess(input: {
  sessionKey: string;
  exePath: string;
  profilePath: string;
  env: NodeJS.ProcessEnv;
}): Promise<AcpProcessHandle> {
  const child = spawn(
    input.exePath,
    ["serve", "--profile", input.profilePath],
    hiddenSubprocessOptions({
      env: input.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    }),
  ) as ChildProcessWithoutNullStreams;
  const stdout = new EventEmitter();
  const handle: AcpProcessHandle = {
    sessionKey: input.sessionKey,
    pid: child.pid,
    child,
    stdout,
  };
  live.set(input.sessionKey, handle);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout.emit("data", chunk);
  });
  child.stderr.on("data", (chunk: string) => {
    console.warn("[remote-expert] adapter stderr", redactDiagnosticsText(chunk));
  });
  child.on("exit", () => {
    live.delete(input.sessionKey);
    processes.delete(input.sessionKey);
    stdout.emit("exit");
  });
  child.on("error", (err) => {
    live.delete(input.sessionKey);
    processes.delete(input.sessionKey);
    stdout.emit("error", err);
  });
  if (!child.pid) {
    throw new RemoteExpertError("ACP_PROCESS_START_FAILED", "adapter spawn failed");
  }
  return handle;
}

export async function stopAcpProcess(sessionKey: string): Promise<void> {
  const handle = live.get(sessionKey);
  processes.delete(sessionKey);
  if (!handle) return;
  handle.child.kill();
  live.delete(sessionKey);
}

export function disposeAllAcpProcesses(): void {
  for (const key of [...live.keys()]) {
    void stopAcpProcess(key);
  }
}
