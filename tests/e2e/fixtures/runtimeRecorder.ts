export type RuntimeTraceEntry = {
  at: number;
  kind: string;
  detail?: unknown;
};

export function createRuntimeRecorder() {
  const entries: RuntimeTraceEntry[] = [];
  return {
    entries,
    record(kind: string, detail?: unknown) {
      entries.push({ at: Date.now(), kind, detail });
    },
    toJSON() {
      return JSON.stringify(entries, null, 2);
    },
    reset() {
      entries.length = 0;
    },
  };
}
