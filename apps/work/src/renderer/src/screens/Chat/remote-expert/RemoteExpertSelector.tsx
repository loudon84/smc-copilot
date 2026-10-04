import { useEffect, useState } from "react";
import type { RemoteExpertCatalogItem } from "../../../../../shared/remote-expert-acp/contract";

interface Props {
  selected: RemoteExpertCatalogItem | null;
  disabled?: boolean;
  onChange: (item: RemoteExpertCatalogItem | null) => void;
}

export function RemoteExpertSelector({ selected, disabled, onChange }: Props) {
  const [items, setItems] = useState<RemoteExpertCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.hermesAPI.remoteExpert
      ?.listCatalog()
      .then((list) => {
        if (!cancelled) setItems(list.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "catalog unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <label className="remote-expert-selector">
      <span className="sr-only">Remote Expert</span>
      <select
        disabled={disabled}
        value={selected?.agent_ref ?? ""}
        onChange={(event) => {
          const next = items.find((item) => item.agent_ref === event.target.value) ?? null;
          onChange(next);
        }}
      >
        <option value="">Local chat</option>
        {items.map((item) => (
          <option
            key={item.agent_ref}
            value={item.agent_ref}
            disabled={item.status !== "ready"}
          >
            {item.display_name}
            {item.status === "unavailable" ? " (unavailable)" : ""}
          </option>
        ))}
      </select>
      {error ? <span>{error}</span> : null}
    </label>
  );
}
