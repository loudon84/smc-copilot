import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FilePreviewPanel } from "./FilePreviewPanel";
import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

vi.mock("./FilePreviewRouter", () => ({
  FilePreviewRouter: () => <div>router</div>,
}));

vi.mock("./MessageDocumentPreview", () => ({
  MessageDocumentPreview: () => <div>doc</div>,
}));

const WIDTH_KEY = "hermes:filePreviewWidth";

function previewState(
  overrides: Partial<FilePreviewState> = {},
): FilePreviewState {
  return {
    open: true,
    loading: false,
    fileId: "file-1",
    descriptor: {
      fileId: "file-1",
      type: "markdown",
      title: "Report.md",
      mime: "text/markdown",
      canOpenExternal: true,
      canSaveAs: true,
      canCopyText: true,
      canAddToContext: false,
      canRetryParse: false,
    },
    ...overrides,
  };
}

describe("FilePreviewPanel", () => {
  beforeEach(() => {
    localStorage.setItem(WIDTH_KEY, "520");
    vi.stubGlobal("hermesAPI", {
      files: {
        openExternal: vi.fn(),
        revealInFolder: vi.fn(),
        saveAs: vi.fn(),
        addToSessionContext: vi.fn(),
        retryParse: vi.fn(),
        createFromMessage: vi.fn(),
      },
    });
  });

  afterEach(() => {
    localStorage.removeItem(WIDTH_KEY);
  });

  it("uses saved width as inline style in normal mode", () => {
    const { container } = render(
      <FilePreviewPanel
        state={previewState()}
        onClose={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    const panel = container.querySelector(".file-preview-panel") as HTMLElement;
    expect(panel.style.width).toBe("520px");
    expect(
      container.querySelector(".file-preview-resize-handle"),
    ).toBeTruthy();
  });

  it("omits inline width and resize handle when maximized", () => {
    const { container } = render(
      <FilePreviewPanel
        state={previewState()}
        maximized
        onToggleMaximized={vi.fn()}
        onClose={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    const panel = container.querySelector(
      ".file-preview-panel-maximized",
    ) as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.width).toBe("");
    expect(
      container.querySelector(".file-preview-resize-handle"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Restore preview" }),
    ).toBeTruthy();
  });

  it("restores saved width after leaving maximized", () => {
    const { container, rerender } = render(
      <FilePreviewPanel
        state={previewState()}
        maximized
        onToggleMaximized={vi.fn()}
        onClose={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    rerender(
      <FilePreviewPanel
        state={previewState()}
        maximized={false}
        onToggleMaximized={vi.fn()}
        onClose={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    const panel = container.querySelector(".file-preview-panel") as HTMLElement;
    expect(panel.style.width).toBe("520px");
    expect(localStorage.getItem(WIDTH_KEY)).toBe("520");
  });
});
