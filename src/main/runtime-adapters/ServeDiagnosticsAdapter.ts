/**
 * Serve Diagnostics adapter (Phase 2).
 */
import { diagnosticsClient } from "../copilot-runtime-client/clients/diagnostics-client";
import { ServeInstanceAdapter } from "./ServeInstanceAdapter";
import type {
  ServeDiagnosticsBundleMeta,
  ServeDiagnosticsEnvironment,
  ServeDiagnosticsLogsResult,
} from "../../shared/copilot-runtime/diagnostics-contract";
import type { RuntimeDiagnosticsSummary } from "../../shared/copilot-runtime/runtime-capability-contract";

export const ServeDiagnosticsAdapter = {
  name: "ServeDiagnosticsAdapter" as const,

  get ready(): boolean {
    return ServeInstanceAdapter.ready;
  },

  summary(): Promise<RuntimeDiagnosticsSummary> {
    return diagnosticsClient.summary();
  },

  environment(): Promise<ServeDiagnosticsEnvironment> {
    return diagnosticsClient.environment();
  },

  logs(options?: { tail?: number }): Promise<ServeDiagnosticsLogsResult> {
    return diagnosticsClient.logs(options);
  },

  bundle(): Promise<ServeDiagnosticsBundleMeta> {
    return diagnosticsClient.bundle();
  },
};
