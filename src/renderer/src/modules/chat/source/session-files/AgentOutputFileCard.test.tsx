import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentOutputFileCard } from "./AgentOutputFileCard";
import type { ManagedFileView } from "@shared/chat-files";

function sampleFile(
  overrides: Partial<ManagedFileView> = {},
): ManagedFileView {
  return {
    id: "file-1",
    name: "客户画像报告.md",
    extension: "md",
    mime: "text/markdown",
    category: "markdown",
    source: "agent-output",
    status: "ready",
    size: 18432,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    hasManagedCopy: true,
    associationRole: "agent-output",
    ordinal: 0,
    ...overrides,
  };
}

describe("AgentOutputFileCard", () => {
  beforeEach(() => {
    vi.stubGlobal("hermesAPI", {
      files: {
        saveAs: vi.fn().mockResolvedValue("/tmp/out.md"),
        openExternal: vi.fn().mockResolvedValue(undefined),
        revealInFolder: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("invokes preview when the card body is clicked", () => {
    const onPreview = vi.fn();
    render(
      <AgentOutputFileCard file={sampleFile()} onPreview={onPreview} />,
    );
    fireEvent.click(screen.getByText("客户画像报告.md"));
    expect(onPreview).toHaveBeenCalledWith("file-1");
  });

  it("wires save / open / reveal actions", async () => {
    const saveAs = vi.fn().mockResolvedValue("/tmp/out.md");
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const revealInFolder = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("hermesAPI", {
      files: { saveAs, openExternal, revealInFolder },
    });

    render(<AgentOutputFileCard file={sampleFile()} profile="default" />);

    const saveBtn = screen.getByLabelText("Save 客户画像报告.md as");
    const openBtn = screen.getByLabelText("Open 客户画像报告.md");
    const revealBtn = screen.getByLabelText("Reveal 客户画像报告.md");

    fireEvent.click(saveBtn);
    await vi.waitFor(() => expect(saveAs).toHaveBeenCalledWith("default", "file-1"));
    await vi.waitFor(() => expect(openBtn).not.toBeDisabled());

    fireEvent.click(openBtn);
    await vi.waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith("default", "file-1"),
    );
    await vi.waitFor(() => expect(revealBtn).not.toBeDisabled());

    fireEvent.click(revealBtn);
    await vi.waitFor(() =>
      expect(revealInFolder).toHaveBeenCalledWith("default", "file-1"),
    );
  });
});
