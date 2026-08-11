import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactBlock } from "./ArtifactBlock";

vi.mock("../useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) => (
    <div className="token">{children}</div>
  ),
}));

vi.mock("react-syntax-highlighter/dist/esm/styles/prism/one-dark", () => ({
  default: {},
}));

describe("ArtifactBlock streaming", () => {
  // @lat: [[rich-content#E2E scenarios#E2E-06 streaming artifact]]
  it("E2E-06: streaming=true has no iframe and Preview disabled", () => {
    const { container, getByTitle } = render(
      <ArtifactBlock code={"<h1>Hello</h1>"} blockId="e2e-06" streaming />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(getByTitle("Preview")).toBeDisabled();
  });
});
