import { useState, useEffect } from "react";
import { Copy } from "lucide-react";
import { useI18n } from "../../useI18n";
import { isBoxDiagram } from "./code-language";
import { DiffBlock } from "./DiffBlock";
import { PlainCodeBlock } from "./PlainCodeBlock";

// Lazy-load the heavy syntax highlighter — only imported when a code block renders
let _highlighterMod: typeof import("react-syntax-highlighter") | null = null;
let _oneDark: Record<string, React.CSSProperties> | null = null;
let _loadingPromise: Promise<void> | null = null;

function loadHighlighter(): Promise<void> {
  if (_highlighterMod && _oneDark) return Promise.resolve();
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = Promise.all([
    import("react-syntax-highlighter"),
    import("react-syntax-highlighter/dist/esm/styles/prism/one-dark"),
  ]).then(([mod, style]) => {
    _highlighterMod = mod;
    _oneDark = style.default;
  });
  return _loadingPromise;
}

// Source-position ids of code blocks the user has expanded. Kept at module
// scope so the choice survives the remounts react-markdown causes while a
// message is still streaming (index-based keys shift as the AST grows, which
// would otherwise reset a per-component useState back to collapsed).
// @lat: [[code-blocks#Expansion must survive streaming remounts]]
const expandedCodeBlocks = new Set<string>();

// Code block with syntax highlighting and copy button (lazy-loaded highlighter)
export function CodeBlock({
  className,
  children,
  blockId,
}: {
  className?: string;
  children?: React.ReactNode;
  blockId?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    blockId ? !expandedCodeBlocks.has(blockId) : true,
  );
  const [highlighterReady, setHighlighterReady] = useState(
    () => _highlighterMod !== null && _oneDark !== null,
  );
  const code = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const isDiff = language === "diff";
  // Diffs win over the box-diagram check: DiffBlock is already a plain per-line
  // renderer (no Prism), so it has no fragmentation risk, and a patch touching
  // a tree diagram must keep its colored +/- view.
  const boxDiagram = !isDiff && isBoxDiagram(code);

  const linesCount = code.split("\n").length;
  const isLong = linesCount > 15 || code.length > 800;

  // Trigger lazy load when code block mounts. Box diagrams and diffs never
  // use Prism, so don't pull in the highlighter for them (see isBoxDiagram).
  useEffect(() => {
    if (!boxDiagram && !isDiff && !highlighterReady) {
      loadHighlighter().then(() => setHighlighterReady(true));
    }
  }, [boxDiagram, highlighterReady, isDiff]);

  function handleCopy(): void {
    void window.hermesAPI.copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const codeContent = isDiff ? (
    <DiffBlock code={code} />
  ) : boxDiagram ? (
    <PlainCodeBlock code={code} />
  ) : highlighterReady && _highlighterMod && _oneDark ? (
    <_highlighterMod.Prism
      style={_oneDark}
      language={language || "text"}
      PreTag="div"
      customStyle={{
        margin: 0,
        borderRadius: 0,
        fontSize: "13px",
        padding: "12px",
        background: "transparent",
      }}
    >
      {code}
    </_highlighterMod.Prism>
  ) : (
    <PlainCodeBlock code={code} />
  );

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">
          {/* Keep the fence's declared language even when a box diagram
              renders plain — the header describes the fence, not the
              renderer. Only default to "text" when none was declared. */}
          {isDiff ? "diff" : language || (boxDiagram ? "text" : "code")}
        </span>
        <button className="chat-code-copy" onClick={handleCopy}>
          {copied ? t("common.copied") : <Copy size={13} />}
        </button>
      </div>
      <div className={isLong && isCollapsed ? "chat-code-collapsed" : ""}>
        {codeContent}
      </div>
      {isLong && (
        <button
          type="button"
          className="chat-code-expand-btn"
          onClick={() =>
            setIsCollapsed((prev) => {
              const next = !prev;
              if (blockId) {
                if (next) expandedCodeBlocks.delete(blockId);
                else expandedCodeBlocks.add(blockId);
              }
              return next;
            })
          }
        >
          {isCollapsed
            ? t("common.showMore") || "Show more"
            : t("common.showLess") || "Show less"}
        </button>
      )}
    </div>
  );
}
