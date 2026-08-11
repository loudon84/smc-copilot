import { useEffect, useMemo, useState } from "react";
import { Code2, Copy, Download, Eye } from "lucide-react";
import { sanitizeSvg } from "./sanitize-svg";
import { CodeBlock } from "./code/CodeBlock";
import { ContentErrorBoundary } from "./ContentErrorBoundary";

export interface SvgBlockProps {
  code: string;
  blockId?: string;
  /** When true (incomplete fence), show source only — do not render. */
  streaming?: boolean;
}

function downloadSvg(filename: string, svg: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Sanitized SVG fence renderer with source/preview toggle and export.
 * Never mounts unsanitized markup — [[sanitizeSvg]] runs first.
 */
export function SvgBlock({
  code,
  blockId,
  streaming = false,
}: SvgBlockProps): React.JSX.Element {
  const [mode, setMode] = useState<"preview" | "source">(
    streaming ? "source" : "preview",
  );
  const [copied, setCopied] = useState(false);

  const sanitized = useMemo(
    () => (streaming ? null : sanitizeSvg(code)),
    [code, streaming],
  );

  useEffect(() => {
    if (streaming) setMode("source");
  }, [streaming]);

  function handleCopy(): void {
    void window.hermesAPI.copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (streaming) {
    return (
      <div className="rich-svg-block">
        <div className="rich-content-toolbar">
          <span className="chat-code-lang">svg</span>
          <span className="rich-content-streaming-hint">Streaming…</span>
        </div>
        <CodeBlock className="language-xml" blockId={blockId}>
          {code}
        </CodeBlock>
      </div>
    );
  }

  if (!sanitized) {
    return (
      <div className="rich-svg-block">
        <div className="rich-content-toolbar">
          <span className="chat-code-lang">svg</span>
          <span className="rich-content-error-msg">Invalid or empty SVG</span>
        </div>
        <CodeBlock className="language-xml" blockId={blockId}>
          {code}
        </CodeBlock>
      </div>
    );
  }

  return (
    <div className="rich-svg-block">
      <div className="rich-content-toolbar">
        <span className="chat-code-lang">svg</span>
        <div className="rich-content-toolbar-actions">
          <button
            type="button"
            className="chat-code-copy"
            title="Preview"
            onClick={() => setMode("preview")}
            aria-pressed={mode === "preview"}
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Source"
            onClick={() => setMode("source")}
            aria-pressed={mode === "source"}
          >
            <Code2 size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Export SVG"
            onClick={() => downloadSvg(`diagram-${blockId ?? "svg"}.svg`, sanitized)}
          >
            <Download size={13} />
          </button>
          <button type="button" className="chat-code-copy" onClick={handleCopy}>
            {copied ? "Copied" : <Copy size={13} />}
          </button>
        </div>
      </div>

      {mode === "source" ? (
        <CodeBlock className="language-xml" blockId={blockId}>
          {code}
        </CodeBlock>
      ) : (
        <ContentErrorBoundary
          fallback={(message) => (
            <div className="rich-content-fallback">
              <p className="rich-content-error-msg">{message}</p>
              <CodeBlock className="language-xml" blockId={blockId}>
                {code}
              </CodeBlock>
            </div>
          )}
        >
          <div
            className="rich-svg-preview"
            // Sanitized above — scripts/handlers/external hrefs stripped.
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        </ContentErrorBoundary>
      )}
    </div>
  );
}
