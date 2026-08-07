import { useI18n } from "../../../components/useI18n";
import { useWorkspaces } from "../context/WorkspacesContext";
import { useWorkspaceTree } from "../hooks/useWorkspaceTree";

export function WorkspacePanel(): React.JSX.Element {
  const { t } = useI18n();
  const { activeProfileId } = useWorkspaces();
  const { currentPath, entries, preview, loading, error, hermesHome, gitStatus, navigate, openFile } =
    useWorkspaceTree(activeProfileId);

  const parent =
    currentPath === "." || currentPath === ""
      ? null
      : currentPath.split("/").slice(0, -1).join("/") || ".";

  const gitLabel = gitStatus.branch
    ? `${gitStatus.branch}${gitStatus.dirtyCount > 0 ? ` · ${gitStatus.dirtyCount} changed` : ""}`
    : t("workspaces.workspace.notGitRepo", { defaultValue: "Not a git repository" });

  return (
    <div className="workspaces-panel-root">
      <p className="workspaces-file-path-bar" title={hermesHome}>
        {hermesHome || t("workspaces.workspace.home", { defaultValue: "Profile home" })}
      </p>
      <p className="workspaces-file-breadcrumb">{gitLabel}</p>
      <p className="workspaces-file-breadcrumb">
        /{currentPath === "." ? "" : currentPath}
        {parent !== null ? (
          <button
            type="button"
            className="workspaces-link-button"
            onClick={() => navigate(parent)}
          >
            ..
          </button>
        ) : null}
      </p>
      {loading ? (
        <p className="workspaces-panel-muted">{t("common.loading")}</p>
      ) : error ? (
        <p className="workspaces-panel-error">{error}</p>
      ) : entries.length === 0 ? (
        <p className="workspaces-panel-muted">
          {t("workspaces.workspace.empty", { defaultValue: "No files in this folder" })}
        </p>
      ) : (
        <ul className="workspaces-file-list">
          {entries.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                className="workspaces-file-item"
                onClick={() => {
                  if (e.isDirectory) navigate(e.path);
                  else void openFile(e.path);
                }}
              >
                {e.isDirectory ? "📁 " : "📄 "}
                {e.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <pre className="workspaces-preview">
        {preview
          ? preview.encoding === "base64"
            ? `[image: ${preview.path}]`
            : preview.content
          : t("workspaces.workspace.previewHint", { defaultValue: "Select a file to preview" })}
      </pre>
    </div>
  );
}
