import { useI18n } from "../../../components/useI18n";
import { useWorkspaces } from "../context/WorkspacesContext";
import { useProfileMemory } from "../hooks/useProfileMemory";
import type { AIOSMemoryFileName } from "../types";

const FILE_TABS: AIOSMemoryFileName[] = ["SOUL.md", "MEMORY.md", "USER.md"];

export function MemoryPanel(): React.JSX.Element {
  const { t } = useI18n();
  const { activeProfileId } = useWorkspaces();
  const { activeFile, draft, dirty, setActiveFile, setDraft, save, loading, files } =
    useProfileMemory(activeProfileId);

  const readonly = files.find((f) => f.file === activeFile)?.readonly ?? false;

  return (
    <div className="workspaces-panel-root workspaces-panel-padded">
      <div className="workspaces-panel-tabs">
        {FILE_TABS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActiveFile(f)}
            className={`workspaces-panel-tab ${activeFile === f ? "is-active" : ""}`}
          >
            {f}
          </button>
        ))}
      </div>
      <textarea
        className="workspaces-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={readonly}
        disabled={loading}
      />
      {!readonly ? (
        <button
          type="button"
          className="workspaces-btn-primary"
          disabled={!dirty || loading}
          onClick={() => void save()}
        >
          {t("common.save", { defaultValue: "Save" })}
        </button>
      ) : (
        <p className="workspaces-panel-muted">
          {t("workspaces.memory.readonly", { defaultValue: "Read-only" })}
        </p>
      )}
    </div>
  );
}
