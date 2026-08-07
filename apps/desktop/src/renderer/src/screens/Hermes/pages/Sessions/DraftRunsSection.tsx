import { useTranslation } from "react-i18next";
import type { SessionCatalogDraftItem } from "@shared/session-catalog/session-catalog-contract";

type Props = {
  drafts: SessionCatalogDraftItem[];
  onOpen: (draft: SessionCatalogDraftItem) => void;
};

export function DraftRunsSection({ drafts, onOpen }: Props) {
  const { t } = useTranslation();
  if (drafts.length === 0) return null;

  return (
    <section className="session-catalog-drafts" data-testid="session-catalog-drafts">
      <h3 className="session-catalog-drafts__title">
        {t("workspaces.hermes.sessions.drafts")}
      </h3>
      <p className="session-catalog-drafts__hint">
        {t("workspaces.hermes.sessions.draftHint")}
      </p>
      <ul className="hermes-session-list">
        {drafts.map((d) => (
          <li key={d.runId} className="hermes-session-list__item">
            <button
              type="button"
              className="hermes-session-list__open"
              onClick={() => onOpen(d)}
            >
              <strong>{d.title || "New Chat"}</strong>
              <span>
                {d.profileId} · {new Date(d.updatedAt).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
