import { useEffect, useState } from "react";
import type { ProfileGatewayState } from "../../../../shared/profile-runtime/profile-runtime-contract";

interface MainRuntimeIndicatorProps {
  activeProfile: string;
}

function dotClassName(status: string | undefined): string {
  switch (status) {
    case "running":
      return "MainRuntimeIndicator__dot MainRuntimeIndicator__dot--running";
    case "starting":
    case "stopping":
      return "MainRuntimeIndicator__dot MainRuntimeIndicator__dot--starting";
    case "failed":
      return "MainRuntimeIndicator__dot MainRuntimeIndicator__dot--failed";
    case "stopped":
    case "not_deployed":
      return "MainRuntimeIndicator__dot MainRuntimeIndicator__dot--stopped";
    default:
      return "MainRuntimeIndicator__dot MainRuntimeIndicator__dot--unknown";
  }
}

export function MainRuntimeIndicator({
  activeProfile,
}: MainRuntimeIndicatorProps): React.JSX.Element {
  const [gatewayState, setGatewayState] = useState<ProfileGatewayState | null>(null);

  useEffect(() => {
    let disposed = false;

    async function refresh(): Promise<void> {
      try {
        const states = await window.profileRuntime.getRuntimeStatus();
        if (disposed) return;
        const match =
          states.find((s) => s.profileId === activeProfile) ?? null;
        setGatewayState(match);
      } catch {
        if (!disposed) setGatewayState(null);
      }
    }

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15_000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [activeProfile]);

  const status = gatewayState?.status ?? "unknown";
  const label = status === "unknown" ? "—" : status;

  return (
    <div
      className="MainRuntimeIndicator no-drag"
      title={
        gatewayState?.lastError
          ? `${status}: ${gatewayState.lastError}`
          : `Gateway: ${status}`
      }
      aria-label={`Gateway ${status}`}
    >
      <span className={dotClassName(status)} />
      <span>{label}</span>
    </div>
  );
}
