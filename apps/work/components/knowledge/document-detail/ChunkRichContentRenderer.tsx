/**
 * Safe Rich Chunk content — DOMParser + allowlist → React nodes.
 * Never uses dangerouslySetInnerHTML. Fail → plain text.
 */

import {
  createElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/utils/tailwind";

const STRUCTURAL_TAG_RE =
  /<\/?(?:p|br|strong|em|b|i|ul|ol|li|code|pre|caption|table|thead|tbody|tfoot|tr|th|td)\b/i;

const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "EM",
  "B",
  "I",
  "UL",
  "OL",
  "LI",
  "CODE",
  "PRE",
  "CAPTION",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
]);

function clampSpan(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return Math.min(20, n);
}

function hasStructuralMarkup(content: string): boolean {
  return STRUCTURAL_TAG_RE.test(content);
}

function convertNode(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // Drop disallowed element but keep safe text descendants.
    return Array.from(el.childNodes).map((child, i) =>
      convertNode(child, `${key}-x${i}`),
    );
  }

  const children = Array.from(el.childNodes).map((child, i) =>
    convertNode(child, `${key}-${i}`),
  );

  if (tag === "BR") {
    return createElement("br", { key });
  }

  const props: Record<string, unknown> = { key };
  if (tag === "TH" || tag === "TD") {
    const colspan = clampSpan(el.getAttribute("colspan"));
    const rowspan = clampSpan(el.getAttribute("rowspan"));
    if (colspan != null) props.colSpan = colspan;
    if (rowspan != null) props.rowSpan = rowspan;
  }

  const reactTag = tag.toLowerCase();
  const element = createElement(reactTag, props, ...children);
  if (tag === "TABLE") {
    return createElement(
      "div",
      { key: `${key}-wrap`, className: "overflow-x-auto" },
      element,
    );
  }
  return element;
}

function renderRich(content: string): ReactNode {
  if (typeof DOMParser === "undefined") {
    return content;
  }
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="chunk-root">${content}</div>`,
      "text/html",
    );
    const root = doc.getElementById("chunk-root");
    if (!root) return content;
    return Array.from(root.childNodes).map((child, i) =>
      convertNode(child, `n${i}`),
    );
  } catch {
    return content;
  }
}

type ChunkRichContentRendererProps = {
  content: string;
  mode: "ellipse" | "full";
  className?: string;
  testId?: string;
};

export function ChunkRichContentRenderer({
  content,
  mode,
  className,
  testId = "knowledge-chunk-rich",
}: ChunkRichContentRendererProps): ReactElement {
  const useRich = hasStructuralMarkup(content);
  const body: ReactNode = useRich ? renderRich(content) : content;

  return createElement(
    "div",
    {
      "data-testid": testId,
      "data-rich": useRich ? "true" : "false",
      className: cn(
        "break-words text-xs font-sans whitespace-pre-wrap",
        mode === "ellipse" &&
          "max-h-[8.5em] overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:8]",
        className,
      ),
    },
    body ?? "",
  );
}

/** Test helper — expose detection without mounting. */
export function chunkContentLooksRich(content: string): boolean {
  return hasStructuralMarkup(content);
}
