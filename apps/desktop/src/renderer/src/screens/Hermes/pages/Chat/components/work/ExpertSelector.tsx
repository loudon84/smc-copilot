import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { workExpertGatewayApi } from "../../../../api/workExpertGatewayApi";
import type {
  UseWorkChatContextReturn,
  WorkChatSelectedExpert,
} from "../../../../types/work-chat";
import { WorkPopoverSelect } from "./WorkPopoverSelect";

const LABELS = {
  expert: "Expert",
  load: "Load experts",
  refresh: "Refresh",
  noExpert: "No expert selected",
  noAuthorized: "No authorized experts",
  unavailable: "Gateway unavailable",
  loading: "Loading…",
  error: "Failed to load experts",
} as const;

type Props = {
  context: UseWorkChatContextReturn;
};

export function ExpertSelector({ context }: Props) {
  const { gatewayStatus, selectedExpert, setExpert } = context;
  const [experts, setExperts] = useState<WorkChatSelectedExpert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gatewayReady = gatewayStatus === "remote";

  const loadExperts = useCallback(async () => {
    if (!gatewayReady) return;
    setLoading(true);
    setError(null);
    try {
      const list = await workExpertGatewayApi.listAuthorizedExperts();
      setExperts(list);
      if (list.length === 0) setError(LABELS.noAuthorized);
    } catch (e) {
      setError(e instanceof Error ? e.message : LABELS.error);
    } finally {
      setLoading(false);
    }
  }, [gatewayReady]);

  useEffect(() => {
    if (gatewayReady) void loadExperts();
  }, [gatewayReady, loadExperts]);

  const disabled = !gatewayReady || loading;
  const placeholder =
    !gatewayReady
      ? LABELS.unavailable
      : loading
        ? LABELS.loading
        : error && experts.length === 0
          ? error
          : LABELS.noExpert;

  return (
    <div className="hermes-work-selector">
      <span className="hermes-work-selector__label">{LABELS.expert}</span>
      <div className="hermes-work-selector__row">
        <WorkPopoverSelect
          value={selectedExpert?.expertId}
          options={experts.map((e) => ({ id: e.expertId, label: e.name }))}
          placeholder={placeholder}
          disabled={disabled}
          searchable
          placement="top"
          menuWidth={220}
          maxMenuHeight={260}
          onChange={(id) => {
            const expert = experts.find((e) => e.expertId === id) ?? null;
            setExpert(expert);
          }}
        />
        <button
          type="button"
          className="hermes-work-selector__refresh"
          disabled={disabled}
          title={LABELS.refresh}
          aria-label={LABELS.refresh}
          onClick={() => void loadExperts()}
        >
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
