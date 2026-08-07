import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useI18n } from "../../../../components/useI18n";
import type { HermesChatModel } from "../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import type { ModelGroup } from "./hooks/useHermesDefaultChatModels";

export function ModelSelector({
  displayModel,
  selectedModelId,
  modelGroups,
  gatewayReady,
  status,
  loading,
  onOpen,
  onSelect,
}: {
  displayModel: string;
  selectedModelId: string | null;
  modelGroups: ModelGroup[];
  gatewayReady: boolean;
  status: string | null;
  loading: boolean;
  onOpen: () => void;
  onSelect: (model: HermesChatModel) => void;
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
    <div className="hermes-webchat-model" ref={ref}>
      <button
        type="button"
        className="hermes-webchat-model-trigger"
        onClick={toggle}
        disabled={!gatewayReady}
        title={
          gatewayReady
            ? displayModel
            : t("workspaces.hermes.chat.gatewayUnavailable", { defaultValue: "Gateway unavailable" })
        }
      >
        <span>{displayModel}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="hermes-webchat-model-menu">
          <div className="hermes-webchat-model-menu-head">
            <span>{t("workspaces.hermes.chat.models", { defaultValue: "Models" })}</span>
            <button type="button" onClick={() => void onOpen()} disabled={loading}>
              <RefreshCw size={12} />
            </button>
          </div>
          {!gatewayReady || status === "gateway_not_running" ? (
            <p className="hermes-webchat-model-empty">
              {t("workspaces.hermes.chat.startProfileHint", {
                defaultValue: "Start gateway to load models.",
              })}
            </p>
          ) : modelGroups.length === 0 ? (
            <p className="hermes-webchat-model-empty">
              {t("workspaces.hermes.chat.noModels", { defaultValue: "No models available." })}
            </p>
          ) : (
            modelGroups.map((group) => (
              <div key={group.provider} className="hermes-webchat-model-group">
                <div className="hermes-webchat-model-group-label">{group.providerLabel}</div>
                {group.models.map((m) => {
                  const isSelected = selectedModelId === m.id;
                  return (
                    <button
                      key={`${group.provider}-${m.id}`}
                      type="button"
                      className={`hermes-webchat-model-item${isSelected ? " is-selected" : ""}`}
                      onClick={() => {
                        onSelect({
                          id: m.id,
                          label: m.label,
                          provider: m.provider,
                          base_url: m.base_url,
                          model: m.model,
                          source: "saved",
                          is_current: isSelected,
                        });
                        setOpen(false);
                      }}
                    >
                      {isSelected ? (
                        <ChevronRight
                          size={12}
                          className="hermes-webchat-model-item-check"
                          aria-hidden
                        />
                      ) : (
                        <span className="hermes-webchat-model-item-check" aria-hidden />
                      )}
                      <span className="hermes-webchat-model-item-label">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

