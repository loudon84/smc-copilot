import { createHash } from "crypto";
import { app } from "electron";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { SkillRunFeatureMode, SkillRunLocalPhase } from "../../shared/skill-run";

export type SkillRunTelemetryEventName =
  | "catalog"
  | "start"
  | "accepted"
  | "reconnect"
  | "terminal"
  | "duplicate-prevented"
  | "artifact";

export interface SkillRunTelemetryEvent {
  event: SkillRunTelemetryEventName;
  at: string;
  featureMode?: SkillRunFeatureMode;
  outcome?: "ok" | "error";
  errorCode?: string;
  phase?: SkillRunLocalPhase | string;
  reconnectAttempt?: number;
  artifactItemCount?: number;
  requestFingerprint?: string;
}

const ALLOWED_KEYS = [
  "event",
  "at",
  "featureMode",
  "outcome",
  "errorCode",
  "phase",
  "reconnectAttempt",
  "artifactItemCount",
  "requestFingerprint",
] as const;

const MAX_BYTES = 512 * 1024;

export function fingerprintRequestId(clientRequestId: string): string {
  return createHash("sha256").update(clientRequestId).digest("hex").slice(0, 12);
}

export function sanitizeSkillRunTelemetryEvent(
  event: SkillRunTelemetryEvent,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = event[key];
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function logFilePath(): string {
  try {
    const userData = app?.getPath?.("userData");
    if (!userData) return "";
    const dir = join(userData, "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, "skill-run-telemetry.jsonl");
  } catch {
    return "";
  }
}

export function recordSkillRunTelemetry(event: SkillRunTelemetryEvent): void {
  try {
    const line = JSON.stringify(sanitizeSkillRunTelemetryEvent(event));
    const file = logFilePath();
    if (!file) return;
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      writeFileSync(file, "");
    }
    appendFileSync(file, `${line}\n`, "utf-8");
  } catch {
    // telemetry must never throw
  }
}
