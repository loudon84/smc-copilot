import { useEffect, useState } from "react";
import { useI18n } from "../../components/useI18n";
import {
  isRemoteExpertCallable,
  type RemoteExpertCatalogItem,
} from "../../../../shared/remote-expert";

interface Props {
  selected: RemoteExpertCatalogItem | null;
  disabled?: boolean;
  gateUnavailable?: boolean;
  onChange: (item: RemoteExpertCatalogItem | null) => void;
}

export function RemoteExpertSelector({
  selected,
  disabled,
  gateUnavailable,
  onChange,
}: Props) {
  const { t } = useI18n();
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("remoteExpert.unavailable"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const blocked = Boolean(disabled || gateUnavailable);

  return (
    <label
      className="remote-expert-selector"
      title={gateUnavailable ? t("remoteExpert.gateUnavailable") : undefined}
    >
      <span className="sr-only">{t("remoteExpert.label")}</span>
      <select
        disabled={blocked}
        value={selected?.agentRef ?? ""}
        onChange={(event) => {
          const next =
            items.find((item) => item.agentRef === event.target.value) ?? null;
          onChange(next);
        }}
      >
        <option value="">{t("remoteExpert.localChat")}</option>
        {items.map((item) => (
          <option
            key={item.agentRef}
            value={item.agentRef}
            disabled={gateUnavailable || !isRemoteExpertCallable(item)}
          >
            {item.displayName}
            {item.status === "unavailable"
              ? ` (${t("remoteExpert.unavailable")})`
              : ""}
          </option>
        ))}
      </select>
      {error ? <span>{error}</span> : null}
    </label>
  );
}
