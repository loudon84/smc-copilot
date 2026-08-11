import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownLink } from "./MarkdownLink";
import { MarkdownImage } from "./MarkdownImage";
import { MarkdownCode } from "./MarkdownCode";
import { mergeAdjacentArtifactFences } from "../merge-artifact-fences";

export interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
  sourceId?: string;
}

export function MarkdownRenderer({
  content,
  streaming = false,
  sourceId,
}: MarkdownRendererProps): React.JSX.Element {
  const merged = mergeAdjacentArtifactFences(content);
  return (
    <div className="rich-content-root chat-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // CodeBlock renders its own chrome; unwrap react-markdown's <pre>.
          pre: ({ children }) => <>{children}</>,
          a: MarkdownLink,
          img: MarkdownImage,
          code: (props) => (
            <MarkdownCode
              {...props}
              content={merged}
              streaming={streaming}
              sourceId={sourceId}
            />
          ),
        }}
      >
        {merged}
      </Markdown>
    </div>
  );
}
