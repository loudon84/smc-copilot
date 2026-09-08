// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillRunProjection } from "../../../../shared/skill-run";
import { SkillRunStatusBar } from "./SkillRunStatusBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function projection(
  overrides: Partial<SkillRunProjection> = {},
): SkillRunProjection {
  return {
    clientRequestId: "req-1",
    providerRunId: "run-1",
    toolName: "writer.article",
    promptSummary: "hello",
    sessionId: "sess-1",
    profileId: "default",
    phase: "succeeded",
    displayStage: "Skill completed successfully",
    lastEventId: "evt-1",
    eventSeq: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SkillRunStatusBar", () => {
  beforeEach(() => {
    vi.stubGlobal("hermesAPI", {
      skillRun: {
        retryArtifactDiscovery: vi.fn().mockResolvedValue(null),
        decideApproval: vi.fn().mockResolvedValue(null),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows retry on succeeded discovery error and invokes existing IPC", async () => {
    render(
      <SkillRunStatusBar
        projection={projection({
          artifactDiscoveryError: true,
          artifactDiscoveryMessage: "Failed to discover output artifacts",
        })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Failed to discover output artifacts")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry artifact discovery"));
    await vi.waitFor(() =>
      expect(window.hermesAPI.skillRun.retryArtifactDiscovery).toHaveBeenCalledWith({
        clientRequestId: "req-1",
        sessionId: "sess-1",
      }),
    );
  });

  it("does not import ExpertArtifactCards and hides retry without discovery error", () => {
    render(
      <SkillRunStatusBar projection={projection()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByText("Retry artifact discovery")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    const relative = "src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx";
    const sourcePath = existsSync(join(process.cwd(), relative))
      ? join(process.cwd(), relative)
      : join(process.cwd(), "apps/work", relative);
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toContain("ExpertArtifactCards");
  });

  it("renders read-only activity kinds under the compact phase row", async () => {
    render(
      <SkillRunStatusBar
        projection={projection({
          phase: "waiting-approval",
          displayStage: "Waiting for approval...",
          activities: [
            {
              eventId: "evt-4",
              kind: "reasoning.summary",
              summary: "checked docs",
            },
            {
              eventId: "evt-2",
              kind: "tool.call",
              toolName: "search",
              callId: "call-1",
              status: "started",
            },
            {
              eventId: "evt-5",
              kind: "clarify.requested",
              question: "which file?",
              options: ["a", "b"],
            },
            {
              eventId: "evt-6",
              kind: "approval.requested",
              approvalId: "appr-1",
              summary: "delete file",
            },
          ],
        })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("writer.article: Waiting for approval...")).toBeTruthy();
    expect(screen.getByText("Reasoning: checked docs")).toBeTruthy();
    expect(screen.getByText("Tool search (started)")).toBeTruthy();
    expect(screen.getByText("Clarification: which file?")).toBeTruthy();
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.getByText("Approval requested: delete file")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Allow")).toBeTruthy();
    expect(screen.getByText("Deny")).toBeTruthy();
    fireEvent.click(screen.getByText("Allow"));
    await vi.waitFor(() =>
      expect(window.hermesAPI.skillRun.decideApproval).toHaveBeenCalledWith({
        clientRequestId: "req-1",
        sessionId: "sess-1",
        decision: "allow",
      }),
    );
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Skip")).toBeNull();
    expect(screen.queryByText("Respond")).toBeNull();
    expect(screen.queryByText("Send")).toBeNull();

    const relative = "src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx";
    const sourcePath = existsSync(join(process.cwd(), relative))
      ? join(process.cwd(), relative)
      : join(process.cwd(), "apps/work", relative);
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toContain("ClarifyCard");
    expect(source).not.toContain("MessageRow");
    expect(source).not.toContain("handleApprove");
    expect(source).not.toContain("clarify-respond");
    expect(source).not.toContain("respondClarify");
    expect(source).toContain("decideApproval");
  });

  it("hides Allow and Deny when the current approval is already decided", () => {
    render(
      <SkillRunStatusBar
        projection={projection({
          phase: "waiting-approval",
          displayStage: "Waiting for approval...",
          decidedApprovalId: "appr-1",
          activities: [
            {
              eventId: "evt-6",
              kind: "approval.requested",
              approvalId: "appr-1",
              summary: "delete file",
            },
          ],
        })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Approval requested: delete file")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.queryByText("Allow")).toBeNull();
    expect(screen.queryByText("Deny")).toBeNull();
  });

  it("does not show Allow or Deny on running or succeeded phases", () => {
    const { rerender } = render(
      <SkillRunStatusBar
        projection={projection({
          phase: "running",
          displayStage: "Executing skill...",
          activities: [
            {
              eventId: "evt-6",
              kind: "approval.requested",
              approvalId: "appr-1",
              summary: "delete file",
            },
          ],
        })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Allow")).toBeNull();
    expect(screen.queryByText("Deny")).toBeNull();
    rerender(
      <SkillRunStatusBar
        projection={projection({
          phase: "succeeded",
          activities: [
            {
              eventId: "evt-6",
              kind: "approval.requested",
              approvalId: "appr-1",
              summary: "delete file",
            },
          ],
        })}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText("Allow")).toBeNull();
    expect(screen.queryByText("Deny")).toBeNull();
  });
});
