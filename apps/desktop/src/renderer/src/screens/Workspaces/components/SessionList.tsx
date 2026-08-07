import { useI18n } from "../../../components/useI18n";
import { useWorkspaces } from "../context/WorkspacesContext";
import { SessionSearch } from "./SessionSearch";

export function SessionList(): React.JSX.Element {
  const { t } = useI18n();
  const {
    activeProfileId,
    activeSessionId,
    setActiveSessionId,
    sessions,
    sessionsLoading,
    sessionsKeyword,
    setSessionsKeyword,
    renameSession,
    deleteSession,
  } = useWorkspaces();

  return (
    <div className="workspaces-session-list">
      <div className="workspaces-session-list-header">
        <h3 className="workspaces-session-list-title">
          {t("navigation.sessions", { defaultValue: "Sessions" })}
        </h3>
        <button
          type="button"
          className="workspaces-action-button"
          onClick={() => setActiveSessionId(null)}
          disabled={!activeProfileId}
        >
          {t("workspaces.sessions.new", { defaultValue: "New" })}
        </button>
      </div>
      <SessionSearch value={sessionsKeyword} onChange={setSessionsKeyword} />
      {sessionsLoading ? (
        <p className="workspaces-panel-muted">{t("common.loading", { defaultValue: "Loading…" })}</p>
      ) : (
        <ul className="workspaces-session-list-scroll">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`workspaces-session-card ${s.id === activeSessionId ? "is-active" : ""}`}
                onClick={() => setActiveSessionId(s.id)}
              >
                <p className="workspaces-session-card-title">{s.title}</p>
                <p className="workspaces-session-card-meta">
                  {s.model ? `${s.model} · ` : ""}
                  {new Date(s.updatedAt).toLocaleString()}
                </p>
              </button>
              <div className="workspaces-session-card-actions">
                <button
                  type="button"
                  className="workspaces-session-link-btn"
                  onClick={() => {
                    const title = window.prompt(
                      t("workspaces.sessions.renamePrompt", { defaultValue: "Session title" }),
                      s.title,
                    );
                    if (title) void renameSession(s.id, title);
                  }}
                >
                  {t("workspaces.sessions.rename", { defaultValue: "Rename" })}
                </button>
                <button
                  type="button"
                  className="workspaces-session-link-btn is-danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        t("workspaces.sessions.deleteConfirm", { defaultValue: "Delete session?" }),
                      )
                    ) {
                      void deleteSession(s.id);
                      if (activeSessionId === s.id) setActiveSessionId(null);
                    }
                  }}
                >
                  {t("common.delete", { defaultValue: "Delete" })}
                </button>
              </div>
            </li>
          ))}
          {sessions.length === 0 ? (
            <li className="workspaces-panel-muted">
              {t("navigation.noSessions", { defaultValue: "No sessions" })}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
