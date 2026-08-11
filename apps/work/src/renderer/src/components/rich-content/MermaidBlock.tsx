import { useEffect, useRef, useState } from "react";
import { Code2, Copy, Download, Eye, RefreshCw } from "lucide-react";
import { THEMES } from "../../constants";
import { useTheme } from "../ThemeProvider";
import { CodeBlock } from "./code/CodeBlock";
import { ContentErrorBoundary } from "./ContentErrorBoundary";

export interface MermaidBlockProps {
  code: string;
  blockId?: string;
  /** When true (incomplete fence), show source/loading — do not run mermaid. */
  streaming?: boolean;
}

let mermaidIdCounter = 0;

function isDarkAppearance(themeId: string): boolean {
  const def = THEMES.find((t) => t.id === themeId);
  return (def?.appearance ?? "dark") === "dark";
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
 * Mermaid fence renderer. Lazy-imports mermaid, only renders when the fence
 * is closed (or streaming=false), and falls back to [[CodeBlock]] on error.
 * Mermaid is initialized with `securityLevel: "strict"` — no arbitrary
 * script injection via config.
 */
export function MermaidBlock({
  code,
  blockId,
  streaming = false,
}: MermaidBlockProps): React.JSX.Element {
  const { resolved } = useTheme();
  const [mode, setMode] = useState<"preview" | "source">(
    streaming ? "source" : "preview",
  );
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !streaming);
  const [copied, setCopied] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (streaming) {
      setMode("source");
      setSvg(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (mode !== "preview") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const mermaid = (await import("mermaid")).default;
          // Strict security — no htmlLabels script paths, no loose eval.
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: isDarkAppearance(resolved) ? "dark" : "default",
          });
          const id = `mermaid-${++mermaidIdCounter}-${(blockId ?? "b").replace(/[^a-zA-Z0-9_-]/g, "")}`;
          const { svg: rendered } = await mermaid.render(id, code);
          if (!cancelled) {
            setSvg(rendered);
            setError(null);
          }
        } catch (err) {
          if (!cancelled) {
            setSvg(null);
            setError(err instanceof Error ? err.message : String(err));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, streaming, mode, resolved, blockId, renderKey]);

  function handleCopy(): void {
    void window.hermesAPI.copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (streaming) {
    return (
      <div className="rich-mermaid-block">
        <div className="rich-content-toolbar">
          <span className="chat-code-lang">mermaid</span>
          <span className="rich-content-streaming-hint">Streaming…</span>
        </div>
        <CodeBlock className="language-mermaid" blockId={blockId}>
          {code}
        </CodeBlock>
      </div>
    );
  }

  const showFallback = error != null || (mode === "preview" && !loading && !svg);

  return (
    <div className="rich-mermaid-block">
      <div className="rich-content-toolbar">
        <span className="chat-code-lang">mermaid</span>
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
            title="Re-render"
            onClick={() => {
              setMode("preview");
              setRenderKey((k) => k + 1);
            }}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className="chat-code-copy"
            title="Export SVG"
            disabled={!svg}
            onClick={() => {
              if (svg) downloadSvg(`mermaid-${blockId ?? "diagram"}.svg`, svg);
            }}
          >
            <Download size={13} />
          </button>
          <button type="button" className="chat-code-copy" onClick={handleCopy}>
            {copied ? "Copied" : <Copy size={13} />}
          </button>
        </div>
      </div>

      {mode === "source" || showFallback ? (
        <div className="rich-content-fallback">
          {error ? (
            <p className="rich-content-error-msg">Mermaid error: {error}</p>
          ) : null}
          <CodeBlock className="language-mermaid" blockId={blockId}>
            {code}
          </CodeBlock>
        </div>
      ) : loading ? (
        <div className="rich-content-loading">Rendering diagram…</div>
      ) : (
        <ContentErrorBoundary
          fallback={(message) => (
            <div className="rich-content-fallback">
              <p className="rich-content-error-msg">{message}</p>
              <CodeBlock className="language-mermaid" blockId={blockId}>
                {code}
              </CodeBlock>
            </div>
          )}
        >
          <div
            className="rich-mermaid-preview"
            dangerouslySetInnerHTML={{ __html: svg ?? "" }}
          />
        </ContentErrorBoundary>
      )}
    </div>
  );
}
