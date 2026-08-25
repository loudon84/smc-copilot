import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExpertArtifactCards } from "./ExpertArtifactCards";
import type { ExpertRunProjection } from "../../../../shared/expert";

function projection(
  overrides: Partial<ExpertRunProjection> = {},
): ExpertRunProjection {
  return {
    clientRequestId: "req-1",
    taskId: "task-1",
    phase: "succeeded",
    displayStage: "finalizing",
    expertSlug: "call-prep",
    skillName: "skill",
    prompt: "hi",
    sessionId: "sess-1",
    profileId: "default",
    lastEventId: null,
    lastEventSeq: null,
    errorCode: null,
    errorMessage: null,
    resultSummary: "ok",
    resultContent: "body",
    progressMessage: null,
    artifactDiscovery: "ready",
    artifactDiscoveryError: null,
    artifactFileIds: ["file-1"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ExpertArtifactCards", () => {
  beforeEach(() => {
    vi.stubGlobal("hermesAPI", {
      files: {
        getFile: vi.fn().mockResolvedValue({
          id: "file-1",
          name: "report.md",
          extension: "md",
          mime: "text/markdown",
          category: "markdown",
          source: "agent-output",
          status: "ready",
          size: 100,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          hasManagedCopy: false,
          locality: "remote",
          canPreview: true,
          availability: "available",
        }),
        saveAs: vi.fn().mockResolvedValue("/tmp/out.md"),
        addToSessionContext: vi.fn().mockResolvedValue(undefined),
        onFileDomainEvent: () => () => undefined,
      },
      expert: {
        retryArtifactDiscovery: vi.fn().mockResolvedValue(null),
      },
    });
  });

  it("renders Added + Preview/Download for discovered artifacts", async () => {
    const onPreview = vi.fn();
    render(
      <ExpertArtifactCards
        projection={projection()}
        profile="default"
        sessionId="sess-1"
        onPreview={onPreview}
      />,
    );
    expect(await screen.findByText("report.md")).toBeTruthy();
    expect(screen.getByText("Added")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Preview report.md"));
    expect(onPreview).toHaveBeenCalledWith("file-1");
  });

  it("shows discovery error with retry", async () => {
    render(
      <ExpertArtifactCards
        projection={projection({
          artifactDiscovery: "error",
          artifactDiscoveryError: "artifacts down",
          artifactFileIds: [],
        })}
      />,
    );
    expect(await screen.findByText(/artifacts down/)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    await vi.waitFor(() =>
      expect(
        window.hermesAPI.expert.retryArtifactDiscovery,
      ).toHaveBeenCalledWith({ clientRequestId: "req-1" }),
    );
  });
});
