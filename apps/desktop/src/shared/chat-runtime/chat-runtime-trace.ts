/** v8.1 — Chat Runtime structured diagnostics (no secrets / full prompts). */

export type ChatRuntimeTrace = {
  eventId: string;
  runId: string;
  turnId: string;
  sequence: number;
  phase: string;
  sessionId?: string;
  profileId: string;
  modelId?: string;
  durationMs?: number;
  errorCode?: string;
};

export type ChatDiagnosticsExport = {
  exportedAt: number;
  runId: string;
  profileId: string;
  sessionId?: string;
  runtimeMetadata: {
    status: string;
    activeTurnId?: string;
    lastEventSequence: number;
    updatedAt: number;
    /** Optional diagnostics enrichment (v8.1.1). */
    storeHealth?: unknown;
    storeProbe?: unknown;
    retention?: unknown;
  };
  eventTimeline: Array<{
    eventId: string;
    turnId: string;
    sequence: number;
    type: string;
    emittedAt: number;
  }>;
  toolTimeline: Array<{
    callId: string;
    name: string;
    status: string;
    turnId: string;
  }>;
  errors: Array<{
    turnId: string;
    code: string;
    message: string;
  }>;
  fileIds: string[];
};
