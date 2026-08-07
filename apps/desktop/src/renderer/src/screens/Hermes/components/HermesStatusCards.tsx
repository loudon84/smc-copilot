import { useHermesDefault } from "../context/HermesDefaultContext";
import { HERMES_DEFAULT_PROFILE_META } from "../constants";
import { HermesStatusBadge } from "./HermesStatusBadge";

export function HermesStatusCards() {
  const { runtime, profile } = useHermesDefault();
  const model = runtime.modelConfig?.model ?? "—";
  const provider = runtime.modelConfig?.provider ?? "—";

  return (
    <header className="hermes-status">
      <div className="hermes-status-cards">
        <div className="hermes-status-card">
          <span className="hermes-status-card__label">Profile</span>
          <strong>
            {profile.profile?.displayName ?? HERMES_DEFAULT_PROFILE_META.displayName}
          </strong>
          <span className="hermes-status-card__meta">
            port {HERMES_DEFAULT_PROFILE_META.gatewayPort}
          </span>
        </div>
        <div className="hermes-status-card">
          <span className="hermes-status-card__label">Gateway</span>
          <HermesStatusBadge status={runtime.status} />
        </div>
        <div className="hermes-status-card">
          <span className="hermes-status-card__label">Model</span>
          <strong>{model}</strong>
          <span className="hermes-status-card__meta">{provider}</span>
        </div>
        {runtime.version ? (
          <div className="hermes-status-card">
            <span className="hermes-status-card__label">Hermes</span>
            <strong className="hermes-status-card__meta">{runtime.version}</strong>
          </div>
        ) : null}
      </div>
    </header>
  );
}
