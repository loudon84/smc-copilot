import type { ReactNode } from "react";

export interface KeepAliveViewProps {
  active: boolean;
  className?: string;
  children: ReactNode;
}

export function KeepAliveView({
  active,
  className = "",
  children,
}: KeepAliveViewProps): React.JSX.Element {
  return (
    <div
      className={className}
      aria-hidden={!active}
      style={{
        display: active ? "flex" : "none",
        flex: active ? 1 : undefined,
        width: active ? "100%" : undefined,
        height: active ? "100%" : undefined,
        minHeight: 0,
        minWidth: 0,
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
