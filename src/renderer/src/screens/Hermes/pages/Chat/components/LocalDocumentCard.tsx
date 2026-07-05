import { ExternalLink, FolderOpen } from "lucide-react";
import type { LocalDocumentRef } from "../utils/extractLocalDocumentPaths";

type Props = {
  document: LocalDocumentRef;
};

function toOpenUrl(path: string): string {
  if (path.startsWith("file://")) return path;
  if (/^[A-Za-z]:\\/.test(path)) {
    return `file:///${path.replace(/\\/g, "/")}`;
  }
  return path.startsWith("/") ? `file://${path}` : path;
}

export function LocalDocumentCard({ document }: Props): React.JSX.Element {
  const openFile = (): void => {
    void window.hermesAPI.openExternal(toOpenUrl(document.path));
  };

  const revealInFolder = (): void => {
    void window.hermesAPI.openExternal(toOpenUrl(document.path));
  };

  return (
    <div className="hermes-local-document-card">
      <div className="hermes-local-document-card__meta">
        <strong>{document.fileName}</strong>
        <span className="hermes-local-document-card__path">{document.path}</span>
      </div>
      <div className="hermes-local-document-card__actions">
        <button type="button" className="hermes-btn hermes-btn--ghost" onClick={openFile}>
          <ExternalLink size={14} />
          打开
        </button>
        <button type="button" className="hermes-btn hermes-btn--ghost" onClick={revealInFolder}>
          <FolderOpen size={14} />
          在文件夹中显示
        </button>
      </div>
    </div>
  );
}
