/**
 * Model Selector Dropdown — anchored panel with portal dropdown-menu styles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Sparkles, Settings, Loader2 } from "lucide-react";
import {
  AnchoredDropdown,
  computeAnchoredPosition,
  type AnchorBounds,
} from "./dropdown-shared";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
  isAvailable?: boolean;
  isFavorite?: boolean;
}

export interface ModelSelectorDropdownProps {
  anchorBounds: AnchorBounds;
  onClose: () => void;
  onSelectModel: (modelId: string) => void;
  onManageModels: () => void;
  currentModel?: string;
  models?: Model[];
}

export function ModelSelectorDropdown({
  anchorBounds,
  onClose,
  onSelectModel,
  onManageModels,
  currentModel = "default",
  models: initialModels,
}: ModelSelectorDropdownProps): React.JSX.Element {
  const [models, setModels] = useState<Model[]>(initialModels ?? []);
  const [loading, setLoading] = useState(!initialModels);
  const [searchQuery, setSearchQuery] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (initialModels || loadedRef.current) return;
    loadedRef.current = true;

    async function loadModels(): Promise<void> {
      try {
        setLoading(true);
        const result = await window.hermesAPI.listModels?.();
        if (result) {
          setModels(
            result.map((m: { id: string; name: string; provider: string }) => ({
              id: m.id,
              name: m.name,
              provider: m.provider,
              isAvailable: true,
            })),
          );
        }
      } catch (err) {
        console.error("[ModelSelector] Failed to load models:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadModels();
  }, [initialModels]);

  const filteredModels = models.filter(
    (model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedModels = filteredModels.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, Model[]>,
  );

  const handleSelect = useCallback(
    (modelId: string) => {
      if (modelId !== currentModel) {
        onSelectModel(modelId);
      }
      onClose();
    },
    [currentModel, onSelectModel, onClose],
  );

  const position = useMemo(
    () =>
      computeAnchoredPosition(anchorBounds, {
        width: 320,
        estimatedHeight: Math.min(filteredModels.length * 40 + 160, 480),
      }),
    [anchorBounds, filteredModels.length],
  );

  return (
    <AnchoredDropdown
      anchorBounds={anchorBounds}
      position={position}
      maxHeight={480}
      onClose={onClose}
    >
      <DropdownMenuLabel className="border-b border-[var(--border-bright)]">
        Select Model
      </DropdownMenuLabel>

      <div className="border-b border-[var(--border-bright)] px-2 py-1.5">
        <input
          type="text"
          placeholder="Search models…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full rounded-sm border px-2 py-1.5 text-sm outline-none",
            "border-[var(--border-bright)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]",
          )}
        />
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {loading ? (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-text)]" />
            Loading models…
          </div>
        ) : filteredModels.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
            {searchQuery ? "No models match your search" : "No models found"}
          </p>
        ) : (
          Object.entries(groupedModels).map(([provider, providerModels]) => (
            <div key={provider}>
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {provider}
              </div>
              {providerModels.map((model) => {
                const selected = model.id === currentModel;
                return (
                  <DropdownMenuCheckboxItem
                    key={model.id}
                    checked={selected}
                    onClick={() => handleSelect(model.id)}
                    className="gap-2"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm",
                        selected
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg-tertiary)] text-[var(--text-muted)]",
                      )}
                    >
                      {model.isFavorite ? <Sparkles size={14} /> : <Bot size={16} />}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-medium">{model.name}</span>
                      {model.description ? (
                        <span className="block truncate text-xs text-[var(--text-muted)]">
                          {model.description}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />
                    ) : null}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </div>
          ))
        )}
      </div>

      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          onManageModels();
          onClose();
        }}
      >
        <Settings size={16} className="text-[var(--text-muted)]" />
        Manage Models
      </DropdownMenuItem>
    </AnchoredDropdown>
  );
}

export default ModelSelectorDropdown;
