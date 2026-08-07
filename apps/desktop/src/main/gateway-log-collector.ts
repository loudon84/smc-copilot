import type { GatewayLogEntry, GatewayLogLevel, GatewayLogQueryOptions } from "../shared/profile-runtime/profile-runtime-contract";

const MAX_BUFFER_SIZE = 2000;
const SUBSCRIBER_HIGH_WATERMARK = 100;

interface CollectorState {
  entries: GatewayLogEntry[];
  subscribers: Set<(entry: GatewayLogEntry) => void>;
}

const collectors = new Map<string, CollectorState>();

function getOrCreateState(profileId: string): CollectorState {
  let state = collectors.get(profileId);
  if (!state) {
    state = { entries: [], subscribers: new Set() };
    collectors.set(profileId, state);
  }
  return state;
}

function pushEntry(profileId: string, level: GatewayLogLevel, message: string): void {
  const state = getOrCreateState(profileId);
  const entry: GatewayLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    profileId,
  };

  state.entries.push(entry);
  if (state.entries.length > MAX_BUFFER_SIZE) {
    state.entries = state.entries.slice(-MAX_BUFFER_SIZE);
  }

  for (const cb of state.subscribers) {
    try {
      cb(entry);
    } catch {
      state.subscribers.delete(cb);
    }
  }
}

export function startCollecting(
  profileId: string,
  proc: { stdout: NodeJS.ReadableStream | null; stderr: NodeJS.ReadableStream | null },
): void {
  getOrCreateState(profileId);

  if (proc.stdout) {
    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (chunk: string) => {
      const lines = chunk.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        pushEntry(profileId, "stdout", line);
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (chunk: string) => {
      const lines = chunk.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        pushEntry(profileId, "stderr", line);
      }
    });
  }
}

export function stopCollecting(profileId: string): void {
  collectors.delete(profileId);
}

export function getHistory(profileId: string, options?: GatewayLogQueryOptions): GatewayLogEntry[] {
  const state = collectors.get(profileId);
  if (!state) return [];

  let entries = state.entries;

  if (options?.level) {
    entries = entries.filter((e) => e.level === options.level);
  }

  if (options?.since) {
    entries = entries.filter((e) => e.timestamp >= options.since!);
  }

  if (options?.limit && options.limit > 0) {
    entries = entries.slice(-options.limit);
  }

  return entries;
}

export function onNewLog(profileId: string, callback: (entry: GatewayLogEntry) => void): () => void {
  const state = getOrCreateState(profileId);
  state.subscribers.add(callback);

  let buffered = 0;
  const wrapped = (entry: GatewayLogEntry) => {
    buffered++;
    if (buffered > SUBSCRIBER_HIGH_WATERMARK) {
      state.subscribers.delete(callback);
      return;
    }
    try {
      callback(entry);
    } catch {
      state.subscribers.delete(callback);
    }
    buffered = 0;
  };

  state.subscribers.delete(callback);
  state.subscribers.add(wrapped);

  return () => {
    state.subscribers.delete(wrapped);
  };
}

export function clearHistory(profileId: string): void {
  const state = collectors.get(profileId);
  if (state) {
    state.entries = [];
  }
}
