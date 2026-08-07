import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../src/shared/i18n";
import { McpGatewayAgentAliasPanel } from "../src/renderer/src/screens/Hermes/pages/McpGateway/McpGatewayAgentAliasPanel";

describe("McpGatewayAgentAliasPanel", () => {
  it("renders common-writer agent row", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <McpGatewayAgentAliasPanel
          agents={[
            {
              agent_alias: "common-writer",
              agent_id: "a1",
              name: "Common Writer",
              runtime_status: "running",
              accepting_tasks: true,
              tools_count: 2,
            },
          ]}
          loading={false}
          pending={false}
          onViewTools={() => undefined}
          onReadinessCheck={() => undefined}
          onOpenAgentPage={() => undefined}
        />
      </I18nextProvider>,
    );
    expect(screen.getByText(/common-writer/)).toBeTruthy();
    expect(screen.getByText(/Common Writer/)).toBeTruthy();
  });
});
