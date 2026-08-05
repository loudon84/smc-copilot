import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SessionFilesPanel } from "./SessionFilesPanel";

vi.mock("./useSessionFiles", () => ({
  useSessionFiles: () => ({
    groups: {
      attachments: [],
      contextFiles: [],
      agentOutput: [],
      other: [],
    },
    loading: false,
    error: null,
    addToContext: vi.fn(),
    removeFromContext: vi.fn(),
    refresh: vi.fn(),
    files: [],
  }),
}));

describe("SessionFilesPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("hermesAPI", {
      files: {
        searchSessionFiles: vi.fn().mockResolvedValue([]),
        onDomainEvent: vi.fn(() => () => undefined),
      },
    });
  });

  it("shows hide button when onHide is provided", () => {
    render(
      <SessionFilesPanel
        sessionId="sess-1"
        onHide={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Hide session files" }),
    ).toBeTruthy();
  });

  it("calls onHide when hide button is clicked", () => {
    const onHide = vi.fn();
    render(<SessionFilesPanel sessionId="sess-1" onHide={onHide} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Hide session files" }),
    );
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("does not show hide button without onHide", () => {
    render(<SessionFilesPanel sessionId="sess-1" />);
    expect(
      screen.queryByRole("button", { name: "Hide session files" }),
    ).toBeNull();
  });
});
