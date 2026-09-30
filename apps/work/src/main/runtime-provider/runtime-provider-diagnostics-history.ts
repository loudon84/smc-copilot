import { DIAGNOSTICS_HISTORY_CAPACITY, projectDiagnosticEvent } from "../../shared/runtime-provider-diagnostics";

const history: Array<Record<string, unknown>> = [];
let recorder: (fields: Record<string, unknown>) => void = appendDiagnosticEvent;

export function appendDiagnosticEvent(fields: Record<string, unknown>): void {
  const projected = projectDiagnosticEvent({
    ...fields,
    timestamp: fields.timestamp ?? new Date().toISOString(),
  });
  history.push(projected);
  while (history.length > DIAGNOSTICS_HISTORY_CAPACITY) history.shift();
}

export function readDiagnosticHistory(): Array<Record<string, unknown>> {
  return history.map((event) => ({ ...event }));
}

export function recordDiagnosticEvent(fields: Record<string, unknown>): void {
  recorder(fields);
}

export function setDiagnosticRecorderForTests(
  next: ((fields: Record<string, unknown>) => void) | null,
): void {
  recorder = next ?? appendDiagnosticEvent;
  if (!next) history.splice(0, history.length);
}

export function clearDiagnosticHistoryForTests(): void {
  history.splice(0, history.length);
}
