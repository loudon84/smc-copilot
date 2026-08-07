import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../src/shared/i18n";
import { McpGatewayTaskResultPanel } from "../src/renderer/src/screens/Hermes/pages/McpGateway/McpGatewayTaskResultPanel";

describe("McpGatewayTaskResultPanel", () => {
  it("renders recent task and load actions when enabled", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <McpGatewayTaskResultPanel
          enabled
          recentTasks={[
            {
              taskId: "task-1",
              toolName: "hermes.write",
              createdAt: new Date().toISOString(),
            },
          ]}
          selectedTaskId={null}
          taskResult={null}
          taskEvents={[]}
          taskEventsError={null}
          pending={false}
          onSelectTask={() => undefined}
          onLoadResult={() => undefined}
          onSubscribeEvents={() => undefined}
          onPreviewArtifact={async () => ({ ok: true })}
          onDownloadArtifact={() => undefined}
          onClearRecent={() => undefined}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText("task-1")).toBeTruthy();
  });
});
