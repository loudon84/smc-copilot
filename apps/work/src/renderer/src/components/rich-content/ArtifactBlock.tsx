import { useRef, useState } from "react";
import {
  Code2,
  Copy,
  Download,
  Eye,
  Maximize2,
  Play,
  Square,
} from "lucide-react";
import { CodeBlock } from "./code/CodeBlock";
import { ContentErrorBoundary } from "./ContentErrorBoundary";
import { ArtifactFrame } from "./ArtifactFrame";

export interface ArtifactBlockProps {
  code: string;
  blockId?: string;
  /** When true (and fence still open), show source only — do not run. */
  streaming?: boolean;
}

function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * HTML artifact block: code/preview toggle, re-run, stop, fullscreen, save.
 * Preview runs inside [[ArtifactFrame]] (sandboxed, no same-origin).
 */
export function ArtifactBlock({
  code,
  blockId,
  streaming = false,
}: ArtifactBlockProps): React.JSX.Element {
  const [mode, setMode] = useState<"code" | "preview">(
    streaming ? "code" : "preview",
  );
  const [running, setRunning] = useState(!streaming);
  const [runToken, setRunToken] = useState(0);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const artifactId = blockId ?? "artifact";

  const showPreview = !streaming && mode === "preview" && running;

  function handleCopy(): void {
    void window.hermesAPI.copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRerun(): void {
    setMode("preview");
    setRunning(true);
    setRunToken((n) => n + 1);
  }

  function handleStop(): void {
    setRunning(false);
  }

  async function handleFullscreen(): Promise<void> {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* fullscreen may be blocked */
    }
  }

  return (
    <div className="rich-artifact-block" ref={containerRef}>
      <div className="rich-content-toolbar">
        <span className="chat-code-lang">html</span>
        <div className="rich-content-toolbar-actions">
          <button
            type="button"
            className="chat-code-copy"
            title="Code"
            onClick={() => setMode("code")}
            aria-pressed={mode === "code"}
          >
            <Code2 size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Preview"
            disabled={streaming}
            onClick={() => {
              setMode("preview");
              setRunning(true);
            }}
            aria-pressed={mode === "preview"}
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Re-run"
            disabled={streaming}
            onClick={handleRerun}
          >
            <Play size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Stop"
            disabled={!running || streaming}
            onClick={handleStop}
          >
            <Square size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Fullscreen"
            onClick={() => void handleFullscreen()}
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Save HTML"
            onClick={() => downloadHtml(`artifact-${artifactId}.html`, code)}
          >
            <Download size={13} />
          </button>
          <button type="button" className="chat-code-copy" onClick={handleCopy}>
            {copied ? "Copied" : <Copy size={13} />}
          </button>
        </div>
      </div>

      {streaming || mode === "code" ? (
        <CodeBlock className="language-html" blockId={blockId}>
          {code}
        </CodeBlock>
      ) : (
        <ContentErrorBoundary
          fallback={(message) => (
            <div className="rich-content-fallback">
              <p className="rich-content-error-msg">{message}</p>
              <CodeBlock className="language-html" blockId={blockId}>
                {code}
              </CodeBlock>
            </div>
          )}
        >
          {showPreview ? (
            <ArtifactFrame
              key={`${artifactId}-${runToken}`}
              html={code}
              artifactId={artifactId}
              active={running}
            />
          ) : (
            <div className="rich-artifact-frame rich-artifact-frame--stopped">
              Preview stopped
            </div>
          )}
        </ContentErrorBoundary>
      )}
    </div>
  );
}
