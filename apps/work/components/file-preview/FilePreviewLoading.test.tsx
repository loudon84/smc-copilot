import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { FilePreviewLoading } from "./FilePreviewLoading";

describe("FilePreviewLoading", () => {
  it("renders download phase with progress bar", () => {
    render(
      React.createElement(FilePreviewLoading, {
        phase: "download",
        fileName: "README.md",
      }),
    );
    expect(screen.getByTestId("file-preview-loading").getAttribute("data-phase")).toBe(
      "download",
    );
    expect(screen.getByText(/Downloading README\.md/i)).toBeTruthy();
    expect(screen.getByTestId("file-preview-loading-bar")).toBeTruthy();
  });

  it("renders prepare phase without download bar", () => {
    render(
      React.createElement(FilePreviewLoading, {
        phase: "prepare",
        fileName: "a.pdf",
      }),
    );
    expect(screen.getByText(/Preparing preview for a\.pdf/i)).toBeTruthy();
    expect(screen.queryByTestId("file-preview-loading-bar")).toBeNull();
  });
});
