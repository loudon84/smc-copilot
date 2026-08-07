import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";
import type { ChatModel } from "../../../../../../shared/workspace-chat/workspace-chat-contract";
import type { ModelGroup } from "./hooks/useChatModels";

export function ModelSelector({
  displayModel,
  modelGroups,
  gatewayReady,
  status,
  loading,
  onOpen,
  onSelect,
  onSaveDefault,
}: {
  displayModel: string;
  modelGroups: ModelGroup[];
  gatewayReady: boolean;
  status: string | null;
  loading: boolean;
  onOpen: () => void;
  onSelect: (model: ChatModel) => void;
  onSaveDefault: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggle(): void {
    if (!open) onOpen();
    setOpen((v) => !v);
  }

  return (
    <div className="workspaces-webchat-model" ref={ref}>
      <button
        type="button"
        className="workspaces-webchat-model-trigger"
        onClick={toggle}
        disabled={!gatewayReady}
        title={
          gatewayReady
            ? displayModel
            : t("workspaces.chat.gatewayUnavailable", { defaultValue: "Gateway unavailable" })
        }
      >
        <span>{displayModel}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="workspaces-webchat-model-menu">
          <div className="workspaces-webchat-model-menu-head">
            <span>{t("workspaces.chat.models", { defaultValue: "Models" })}</span>
            <button type="button" onClick={() => void onOpen()} disabled={loading}>
              <RefreshCw size={12} />
            </button>
          </div>
          {!gatewayReady || status === "gateway_not_running" ? (
            <p className="workspaces-webchat-model-empty">
              {t("workspaces.chat.startProfileHint", {
                defaultValue: "Start profile to load models.",
              })}
            </p>
          ) : modelGroups.length === 0 ? (
            <p className="workspaces-webchat-model-empty">
              {t("workspaces.chat.noModels", { defaultValue: "No models available." })}
            </p>
          ) : (
            modelGroups.map((group) => (
              <div key={group.provider} className="workspaces-webchat-model-group">
                <div className="workspaces-webchat-model-group-label">{group.providerLabel}</div>
                {group.models.map((m) => (
                  <button
                    key={`${group.provider}-${m.id}`}
                    type="button"
                    className="workspaces-webchat-model-item"
                    onClick={() => {
                      onSelect({
                        id: m.id,
                        label: m.label,
                        provider: m.provider,
                        base_url: m.base_url,
                        source: "gateway",
                        is_current: false,
                      });
                      setOpen(false);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ))
          )}
          <button type="button" className="workspaces-webchat-model-save" onClick={() => void onSaveDefault()}>
            {t("workspaces.chat.saveDefaultModel", { defaultValue: "Save as default" })}
          </button>
        </div>
      )}
    </div>
  );
}
