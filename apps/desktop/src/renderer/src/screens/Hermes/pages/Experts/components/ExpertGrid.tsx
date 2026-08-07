import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function ExpertGrid({ children }: Props) {
  return <div className="hermes-expert-grid">{children}</div>;
}
