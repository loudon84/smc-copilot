import type { StartupDecision } from "../../../../shared/startup/startup-contract";
import { RuntimeRecoveryActions } from "./RuntimeRecoveryActions";
import { RuntimeRecoveryStatus } from "./RuntimeRecoveryStatus";

export interface RuntimeRecoveryScreenProps {
  decision: StartupDecision | null;
  error?: string | null;
  onRetry: () => void;
  onEnterMain?: () => void;
}

/**
 * Runtime Recovery (PRD v1.3.1) — replaces Welcome / Install / Setup startup screens.
 * Never offers Hermes install, curl install.sh, or Hermes gateway connection.
 */
export default function RuntimeRecoveryScreen({
  decision,
  error,
  onRetry,
  onEnterMain,
}: RuntimeRecoveryScreenProps): React.JSX.Element {
  return (
    <div className="runtime-recovery-screen" data-testid="runtime-recovery-screen">
      <div className="runtime-recovery-card">
        <RuntimeRecoveryStatus
          reason={decision?.reason ?? "runtime-missing"}
          runtimeState={decision?.runtimeState ?? null}
          error={error ?? decision?.error}
        />
        <RuntimeRecoveryActions
          runtimeState={decision?.runtimeState ?? null}
          onRetry={onRetry}
          onEnterMain={onEnterMain}
        />
      </div>
      <style>{`
        .runtime-recovery-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-primary, #0f1115);
          color: var(--text-primary, #e8eaed);
        }
        .runtime-recovery-card {
          max-width: 560px;
          width: 100%;
          border: 1px solid var(--border-color, #2a2f3a);
          border-radius: 12px;
          padding: 28px 24px;
          background: var(--bg-secondary, #161a22);
        }
        .runtime-recovery-title {
          margin: 0 0 8px;
          font-size: 1.4rem;
        }
        .runtime-recovery-subtitle {
          margin: 0 0 16px;
          opacity: 0.85;
          line-height: 1.5;
        }
        .runtime-recovery-meta {
          display: grid;
          gap: 8px;
          margin: 0 0 16px;
        }
        .runtime-recovery-meta dt {
          font-size: 0.75rem;
          opacity: 0.65;
        }
        .runtime-recovery-meta dd {
          margin: 0;
        }
        .runtime-recovery-error {
          color: #f87171;
        }
      `}</style>
    </div>
  );
}
