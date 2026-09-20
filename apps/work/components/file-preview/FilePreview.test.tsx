import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FilePreview } from "./FilePreview";
import type { FilePreviewProvider } from "./types";

vi.mock("@open-file-viewer/react", () => ({
  FileViewer: () => React.createElement("div", { "data-testid": "mock-ofv" }),
}));
vi.mock("@open-file-viewer/core", () => ({
  textPlugin: () => ({ name: "text" }),
  imagePlugin: () => ({ name: "image" }),
  pdfPlugin: () => ({ name: "pdf" }),
  officePlugin: () => ({ name: "office" }),
}));
vi.mock("@open-file-viewer/core/style.css", () => ({}));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "/mock-pdf.worker.mjs",
}));

describe("FilePreview", () => {
  it("renders ready state from injected knowledge provider", async () => {
    const knowledge: FilePreviewProvider = {
      resolve: async () => ({
        ok: true,
        resolved: {
          file: new File(["# hi"], "a.md", { type: "text/markdown" }),
          fileName: "a.md",
          mime: "text/markdown",
          format: "markdown",
        },
      }),
    };
    render(
      React.createElement(FilePreview, {
        source: { type: "knowledge", id: "sf-1", name: "a.md" },
        providers: { knowledge },
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("file-preview-ready")).toBeTruthy();
    });
    expect(screen.getByTestId("file-preview-ofv-host")).toBeTruthy();
  });

  it("shows download loading phase while knowledge resolve runs", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const knowledge: FilePreviewProvider = {
      resolve: async (_source, options) => {
        options?.onPhase?.("download");
        await gate;
        options?.onPhase?.("prepare");
        return {
          ok: true,
          resolved: {
            file: new File(["# hi"], "README.md", { type: "text/markdown" }),
            fileName: "README.md",
            mime: "text/markdown",
            format: "markdown",
          },
        };
      },
    };
    render(
      React.createElement(FilePreview, {
        source: {
          type: "knowledge",
          id: "sf-1",
          name: "README.md",
        },
        providers: { knowledge },
      }),
    );
    await waitFor(() => {
      const loading = screen.getByTestId("file-preview-loading");
      expect(loading.getAttribute("data-phase")).toBe("download");
      expect(loading.textContent).toMatch(/Downloading/i);
    });
    expect(screen.getByTestId("file-preview-loading-bar")).toBeTruthy();
    finish();
    await waitFor(() => {
      expect(screen.getByTestId("file-preview-ready")).toBeTruthy();
    });
  });

  it("does not re-resolve when source is a new object with the same fields", async () => {
    const resolve = vi.fn(async () => ({
      ok: true as const,
      resolved: {
        file: new File(["# hi"], "a.md", { type: "text/markdown" }),
        fileName: "a.md",
        mime: "text/markdown",
        format: "markdown" as const,
      },
    }));
    const knowledge: FilePreviewProvider = { resolve };
    const providers = { knowledge };
    const baseSource = {
      type: "knowledge" as const,
      id: "sf-1",
      name: "a.md",
      activeVersionId: "v1",
    };
    const { rerender } = render(
      React.createElement(FilePreview, {
        source: { ...baseSource },
        providers,
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("file-preview-ready")).toBeTruthy();
    });
    const afterReady = resolve.mock.calls.length;
    expect(afterReady).toBeGreaterThanOrEqual(1);

    rerender(
      React.createElement(FilePreview, {
        source: { ...baseSource },
        providers,
      }),
    );
    // Allow a tick; same-value source must not schedule another resolve.
    await new Promise((r) => setTimeout(r, 30));
    expect(resolve).toHaveBeenCalledTimes(afterReady);

    rerender(
      React.createElement(FilePreview, {
        source: { ...baseSource, activeVersionId: "v2" },
        providers,
      }),
    );
    await waitFor(() => {
      expect(resolve.mock.calls.length).toBe(afterReady + 1);
    });
  });
});
