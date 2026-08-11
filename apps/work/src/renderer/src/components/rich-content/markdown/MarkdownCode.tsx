import type { ExtraProps } from "react-markdown";
import { CodeBlock } from "../code/CodeBlock";
import { MermaidBlock } from "../MermaidBlock";
import { SvgBlock } from "../SvgBlock";
import { ArtifactBlock } from "../ArtifactBlock";
import { isFenceClosed } from "../stream-fence";

function languageFromClassName(className?: string): string {
  const match = /language-(\w+)/.exec(className || "");
  return match ? match[1].toLowerCase() : "";
}

export function MarkdownCode({
  className,
  children,
  node,
  content,
  streaming = false,
  sourceId,
  ...props
}: React.ComponentProps<"code"> &
  ExtraProps & {
    content: string;
    streaming?: boolean;
    sourceId?: string;
  }): React.JSX.Element {
  const isInline =
    !className &&
    typeof children === "string" &&
    !String(children).includes("\n");
  if (isInline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const start = node?.position?.start;
  const end = node?.position?.end;
  const blockId =
    start != null
      ? `${sourceId ? `${sourceId}:` : ""}${start.offset ?? start.line}:${className ?? ""}`
      : sourceId;

  const code = String(children).replace(/\n$/, "");
  const language = languageFromClassName(className);
  const fenceClosed =
    !streaming || isFenceClosed(content, start?.offset, end?.offset);
  const blockStreaming = streaming && !fenceClosed;

  if (language === "mermaid") {
    return (
      <MermaidBlock
        code={code}
        blockId={blockId}
        streaming={blockStreaming}
      />
    );
  }
  if (language === "svg") {
    return (
      <SvgBlock code={code} blockId={blockId} streaming={blockStreaming} />
    );
  }
  if (language === "html") {
    return (
      <ArtifactBlock
        code={code}
        blockId={blockId}
        streaming={blockStreaming}
      />
    );
  }
  // diff → DiffBlock inside CodeBlock (colored +/- lines, copy, collapse)
  return (
    <CodeBlock className={className} blockId={blockId}>
      {children}
    </CodeBlock>
  );
}
