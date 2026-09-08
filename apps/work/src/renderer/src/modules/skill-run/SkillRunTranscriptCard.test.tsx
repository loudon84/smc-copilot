// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillRunMessage } from "../../screens/Chat/types";
import { SkillRunTranscriptCard } from "./SkillRunTranscriptCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function card(overrides: Partial<SkillRunMessage> = {}): SkillRunMessage {
  return {
    id: "skill-run:req-1",
    kind: "skill_run",
    role: "agent",
    clientRequestId: "req-1",
    toolName: "writer",
    phase: "succeeded",
    displayStage: "Skill completed successfully",
    activities: [],
    pending: false,
    ...overrides,
  };
}

describe("SkillRunTranscriptCard", () => {
  beforeEach(() => {
    vi.stubGlobal("hermesAPI", {
      skillRun: {
        decideApproval: vi.fn().mockResolvedValue(null),
        cancel: vi.fn().mockResolvedValue(null),
      },
    });
  });

  it("renders result, incomplete banner, and read-only clarify options", () => {
    render(
      <SkillRunTranscriptCard
        sessionId="session-1"
        msg={card({
          resultText: "done",
          auditComplete: false,
          activities: [
            {
              eventId: "c1",
              kind: "clarify.requested",
              question: "Which region?",
              options: ["cn", "us"],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("done")).toBeTruthy();
    expect(screen.getByText("skillRun.transcriptIncomplete")).toBeTruthy();
    expect(screen.getByText("Which region?")).toBeTruthy();
    expect(screen.getByText("cn")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("uses existing approval decision IPC and File preview callback", () => {
    const onPreviewFile = vi.fn();
    render(
      <SkillRunTranscriptCard
        sessionId="session-1"
        onPreviewFile={onPreviewFile}
        msg={card({
          phase: "waiting-approval",
          pending: true,
          artifactFileIds: ["file-1"],
          activities: [
            {
              eventId: "a1",
              kind: "approval.requested",
              approvalId: "appr-1",
              summary: "Allow write?",
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByText("skillRun.approvalAllow"));
    expect(window.hermesAPI.skillRun.decideApproval).toHaveBeenCalledWith({
      clientRequestId: "req-1",
      sessionId: "session-1",
      decision: "allow",
    });
    fireEvent.click(screen.getByText("skillRun.resultReady"));
    expect(onPreviewFile).toHaveBeenCalledWith("file-1");
  });

  it("does not serialize forbidden raw fields", () => {
    const { container } = render(
      <SkillRunTranscriptCard
        sessionId="session-1"
        msg={card({ errorMessage: "failed safely" })}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain("authorization");
    expect(html).not.toContain("endpoint");
    expect(html).not.toContain("bearer ");
    expect(html).not.toContain("arguments");
    expect(html).not.toContain("artifact bytes");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/[a-z]:\\/);
  });
});
