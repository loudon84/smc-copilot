// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RemoteExpertSelector } from "./RemoteExpertSelector";

describe("RemoteExpertSelector", () => {
  it("does not fetch until mounted and shows local chat option", async () => {
    const catalog = vi.fn(async () => ({
      items: [
        {
          agent_ref: "sales-expert",
          display_name: "Sales Expert",
          status: "ready" as const,
          capabilities: {
            acp_protocol_version: 1,
            attachments: "resource_link",
            session_resume: true,
          },
        },
        {
          agent_ref: "down",
          display_name: "Down",
          status: "unavailable" as const,
          capabilities: {
            acp_protocol_version: 1,
            attachments: "resource_link",
            session_resume: true,
          },
        },
      ],
    }));
    window.hermesAPI = {
      ...window.hermesAPI,
      remoteExpert: {
        listCatalog: catalog,
        getAvailability: async () => ({ enabled: true, mode: "alpha", packed: false }),
        getBinding: async () => null,
        submit: async () => ({ turnId: "t" }),
        cancel: async () => undefined,
        close: async () => undefined,
        resume: async () => ({
          sessionId: "s",
          provider: "nodeskclaw-acp",
          agentRef: "sales-expert",
          acpSessionId: "a",
          profileName: "Sales Expert",
          profileDigest: "x",
          knowledgeRefs: [],
          connectorBindingRefs: [],
          integrationAccountRefs: [],
          state: "active",
        }),
        decidePermission: async () => undefined,
        onEvent: () => () => undefined,
      },
    } as typeof window.hermesAPI;
    render(<RemoteExpertSelector selected={null} onChange={() => undefined} />);
    expect(screen.getByText("Local chat")).toBeTruthy();
    await waitFor(() => expect(catalog).toHaveBeenCalled());
  });
});
