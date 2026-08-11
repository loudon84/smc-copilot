import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Fixed bottom composer region — full chat width, never narrowed by panels.
 */
export function ChatComposerArea({
  children,
  className,
}: Props): React.JSX.Element {
  return (
    <div className={`chat-input-area ${className || ""}`.trim()}>
      {children}
    </div>
  );
}

export default ChatComposerArea;
