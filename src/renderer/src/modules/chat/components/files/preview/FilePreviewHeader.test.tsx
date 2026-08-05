import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilePreviewHeader } from "./FilePreviewHeader";

const baseProps = {
  onOpenExternal: vi.fn(),
  onReveal: vi.fn(),
  onSaveAs: vi.fn(),
  onClose: vi.fn(),
  descriptor: {
    fileId: "f1",
    type: "markdown" as const,
    title: "Report.md",
    mime: "text/markdown",
    canOpenExternal: true,
    canSaveAs: true,
    canCopyText: true,
    canAddToContext: false,
    canRetryParse: false,
  },
};

describe("FilePreviewHeader", () => {
  it("shows Maximize when not maximized", () => {
    render(
      <FilePreviewHeader
        {...baseProps}
        maximized={false}
        onToggleMaximized={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Maximize preview" }),
    ).toBeTruthy();
  });

  it("shows Minimize when maximized and sets aria-pressed", () => {
    render(
      <FilePreviewHeader
        {...baseProps}
        maximized
        onToggleMaximized={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: "Restore preview" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onToggleMaximized when maximize button is clicked", () => {
    const onToggleMaximized = vi.fn();
    render(
      <FilePreviewHeader
        {...baseProps}
        maximized={false}
        onToggleMaximized={onToggleMaximized}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Maximize preview" }),
    );
    expect(onToggleMaximized).toHaveBeenCalledTimes(1);
  });
});
