import type { ReactNode } from "react";

/** @deprecated V3.3 — login is handled at App startup; this is a passthrough. */
export interface LoginGateProps {
  children: ReactNode;
}

export function LoginGate({ children }: LoginGateProps): React.JSX.Element {
  return <>{children}</>;
}
