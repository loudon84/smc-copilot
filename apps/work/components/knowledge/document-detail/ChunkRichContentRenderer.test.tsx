/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ChunkRichContentRenderer,
  chunkContentLooksRich,
} from "./ChunkRichContentRenderer";

describe("ChunkRichContentRenderer", () => {
  it("detects structural markup", () => {
    expect(chunkContentLooksRich("plain")).toBe(false);
    expect(chunkContentLooksRich("<table><tr><td>a</td></tr></table>")).toBe(
      true,
    );
  });

  it("renders table structure without dangerouslySetInnerHTML", () => {
    const { container } = render(
      <ChunkRichContentRenderer
        content="<table><tr><td colspan='2'>cell</td></tr></table>"
        mode="full"
      />,
    );
    expect(screen.getByTestId("knowledge-chunk-rich").dataset.rich).toBe(
      "true",
    );
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelector("td")?.getAttribute("colspan")).toBe("2");
    expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
  });

  it("strips script and falls back safely for disallowed tags", () => {
    const { container } = render(
      <ChunkRichContentRenderer
        content={'<p>ok</p><script>alert(1)</script><img src="x" />'}
        mode="full"
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("ok");
  });

  it("uses plain text when no structural tags", () => {
    render(
      <ChunkRichContentRenderer content={"line1\nline2"} mode="ellipse" />,
    );
    expect(screen.getByTestId("knowledge-chunk-rich").dataset.rich).toBe(
      "false",
    );
    expect(screen.getByTestId("knowledge-chunk-rich").textContent).toBe(
      "line1\nline2",
    );
  });
});
