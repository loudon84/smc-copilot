import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type ChatModelGroup = {
  provider: string;
  providerLabel: string;
  models: Array<{
    id: string;
    label: string;
    provider: string;
    model: string;
    baseUrl?: string | null;
  }>;
};

type Props = {
  groups: ChatModelGroup[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
  onConfigure?: () => void;
};

export const ModelPicker = memo(function ModelPicker({
  groups,
  selectedModelId,
  onSelect,
  disabled,
  onConfigure,
}: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    const openExt = () => {
      setOpen(true);
      setSearch("");
      setBrand(null);
    };
    window.addEventListener("model-picker:open", openExt);
    return () => window.removeEventListener("model-picker:open", openExt);
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        models: g.models.filter(
          (m) =>
            !q ||
            m.label.toLowerCase().includes(q) ||
            m.model.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, q]);

  const rows = filtered.flatMap((g) =>
    g.models.map((m) => ({ ...m, brand: g.provider, brandLabel: g.providerLabel })),
  );
  const brands = filtered.map((g) => ({
    id: g.provider,
    label: g.providerLabel,
    count: g.models.length,
  }));
  const activeBrand =
    brand && brands.some((b) => b.id === brand) ? brand : null;
  const visible = activeBrand
    ? rows.filter((r) => r.brand === activeBrand)
    : rows;

  const selected = rows.find((r) => r.id === selectedModelId);
  const display = selected?.label || selected?.model || "Default";

  if (groups.length === 0) return null;

  return (
    <div className="model-picker model-picker--rich" ref={rootRef}>
      <button
        type="button"
        className="model-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{display}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="model-picker-popover">
          <div className="model-picker-search">
            <Search size={14} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models…"
            />
          </div>
          <div className="model-picker-body">
            <aside className="model-picker-rail">
              <button
                type="button"
                className={!activeBrand ? "is-active" : ""}
                onClick={() => setBrand(null)}
              >
                All
              </button>
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={activeBrand === b.id ? "is-active" : ""}
                  onClick={() => setBrand(b.id)}
                >
                  {b.label} ({b.count})
                </button>
              ))}
            </aside>
            <div className="model-picker-list">
              {visible.map((m) => {
                const active = m.id === selectedModelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`model-picker-row${active ? " is-active" : ""}`}
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                    }}
                  >
                    <span className="model-picker-row-label">{m.label}</span>
                    <span className="model-picker-row-meta">
                      {m.brandLabel || m.provider}
                      {m.baseUrl ? ` · ${m.baseUrl}` : ""}
                    </span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
              {visible.length === 0 && (
                <div className="model-picker-empty">No models</div>
              )}
            </div>
          </div>
          {onConfigure && (
            <button
              type="button"
              className="model-picker-configure"
              onClick={() => {
                setOpen(false);
                onConfigure();
              }}
            >
              Configure…
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default ModelPicker;

/** Build provider groups from a flat model list. */
export function groupChatModels(
  models: Array<{
    id: string;
    label: string;
    provider?: string | null;
    model: string;
    baseUrl?: string | null;
  }>,
): ChatModelGroup[] {
  const map = new Map<string, ChatModelGroup>();
  for (const m of models) {
    const provider = m.provider || "other";
    let group = map.get(provider);
    if (!group) {
      group = {
        provider,
        providerLabel: provider,
        models: [],
      };
      map.set(provider, group);
    }
    group.models.push({
      id: m.id,
      label: m.label || m.model,
      provider,
      model: m.model,
      baseUrl: m.baseUrl,
    });
  }
  return [...map.values()];
}
