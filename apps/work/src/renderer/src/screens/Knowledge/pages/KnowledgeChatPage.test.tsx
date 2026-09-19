// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../Chat/Chat", () => ({
  default: (props: {
    knowledgeRequired?: boolean;
    knowledgeContext?: { knowledgeSetId: string } | null;
    knowledgeControl?: React.ReactNode;
    runId?: string;
  }) => (
    <div
      data-testid="shared-chat"
      data-knowledge-required={String(!!props.knowledgeRequired)}
      data-set-id={props.knowledgeContext?.knowledgeSetId ?? ""}
      data-run-id={props.runId ?? ""}
    >
      {props.knowledgeControl}
    </div>
  ),
}));

vi.mock("../../Chat/knowledge/KnowledgeConnector", () => ({
  KnowledgeConnector: () => <div data-testid="knowledge-connector" />,
}));

import { KnowledgeChatPage } from "./KnowledgeChatPage";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "KnowledgeChatPage.tsx"),
  "utf8",
);

describe("KnowledgeChatPage A-MIGRATE-001", () => {
  it("source oracle: no synthetic session/citation/echo path", () => {
    expect(pageSource).not.toMatch(/mutateEntity/);
    expect(pageSource).not.toMatch(/\bLocalMessage\b/);
    expect(pageSource).not.toMatch(/assistant echo/i);
    expect(pageSource).toMatch(/from \"\.\.\/\.\.\/Chat\/Chat\"/);
    expect(pageSource).toMatch(/knowledgeRequired/);
  });
});

describe("KnowledgeChatPage mount", () => {
  beforeEach(() => {
    (
      window as unknown as { hermesAPI: Record<string, unknown> }
    ).hermesAPI = {
      listKbSetSessions: vi.fn(async () => []),
      getSessionKnowledgeContext: vi.fn(async () => null),
      deleteSession: vi.fn(async () => undefined),
      knowledgeJobs: {
        sets: {
          list: vi.fn(async () => ({ items: [] })),
          get: vi.fn(),
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts exactly one Shared Chat with knowledgeRequired", async () => {
    render(
      <KnowledgeChatPage
        params={{ knowledgeSetId: "KS-A" }}
        profile="default"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId("shared-chat")).toHaveLength(1);
    });
    const chat = screen.getByTestId("shared-chat");
    expect(chat.getAttribute("data-knowledge-required")).toBe("true");
    expect(chat.getAttribute("data-set-id")).toBe("KS-A");
    expect(screen.getByTestId("knowledge-connector")).toBeTruthy();
  });

  it("remounts Chat when profile changes (single mount abort)", async () => {
    const { rerender } = render(
      <KnowledgeChatPage
        params={{ knowledgeSetId: "KS-A" }}
        profile="default"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shared-chat")).toBeTruthy();
    });
    const firstRun = screen
      .getByTestId("shared-chat")
      .getAttribute("data-run-id");
    rerender(
      <KnowledgeChatPage
        params={{ knowledgeSetId: "KS-A" }}
        profile="other"
      />,
    );
    await waitFor(() => {
      const next = screen
        .getByTestId("shared-chat")
        .getAttribute("data-run-id");
      expect(next).not.toBe(firstRun);
    });
    expect(screen.getAllByTestId("shared-chat")).toHaveLength(1);
  });

  it("remounts Chat on New knowledge chat", async () => {
    render(
      <KnowledgeChatPage
        params={{ knowledgeSetId: "KS-A", sessionId: "sess-1" }}
        profile="default"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shared-chat")).toBeTruthy();
    });
    const firstRun = screen
      .getByTestId("shared-chat")
      .getAttribute("data-run-id");
    screen.getByRole("button", { name: /New knowledge chat/i }).click();
    await waitFor(() => {
      const next = screen
        .getByTestId("shared-chat")
        .getAttribute("data-run-id");
      expect(next).not.toBe(firstRun);
    });
  });
});
