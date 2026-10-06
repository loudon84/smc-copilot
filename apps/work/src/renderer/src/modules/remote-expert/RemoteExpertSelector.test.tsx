// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RemoteExpertSelector } from "./RemoteExpertSelector";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "remoteExpert.label": "Remote Expert",
        "remoteExpert.localChat": "Local chat",
        "remoteExpert.unavailable": "unavailable",
        "remoteExpert.gateUnavailable": "Remote Expert is unavailable. Sending is blocked.",
      }[key] ?? key),
  }),
}));

describe("RemoteExpertSelector", () => {
  it("[A-UI-001] fetches catalog on mount and shows local chat option", async () => {
    const catalog = vi.fn(async () => ({
      items: [
        {
          agentRef: "sales-expert",
          displayName: "Sales Expert",
          description: null,
          category: "sales",
          tags: [],
          avatar: null,
          status: "ready" as const,
          capabilities: {
            acp: { protocolVersion: 1 as const, remoteTransport: true },
            sessionResume: true,
            attachments: "resource_link",
            artifacts: "resource_link",
            permissions: true,
          },
        },
      ],
    }));
    window.hermesAPI = {
      ...window.hermesAPI,
      remoteExpert: {
        listCatalog: catalog,
        getAvailability: async () => ({
          enabled: true,
          gateState: "COMPATIBLE",
          packed: false,
        }),
        getSession: async () => null,
        submit: async () => ({ requestId: "t", sessionId: "s" }),
        cancel: async () => undefined,
        close: async () => undefined,
        resume: async () => null,
        decidePermission: async () => undefined,
        onEvent: () => () => undefined,
      },
    } as typeof window.hermesAPI;
    render(<RemoteExpertSelector selected={null} onChange={() => undefined} />);
    expect(screen.getByText("Local chat")).toBeTruthy();
    await waitFor(() => expect(catalog).toHaveBeenCalled());
  });

  it("[A-NEG-UI-001] greys out the selector when the contract gate is unavailable", async () => {
    window.hermesAPI = {
      ...window.hermesAPI,
      remoteExpert: {
        listCatalog: async () => ({ items: [] }),
        getAvailability: async () => ({
          enabled: false,
          gateState: "INCOMPATIBLE",
          packed: false,
        }),
        getSession: async () => null,
        submit: async () => ({ requestId: "t", sessionId: "s" }),
        cancel: async () => undefined,
        close: async () => undefined,
        resume: async () => null,
        decidePermission: async () => undefined,
        onEvent: () => () => undefined,
      },
    } as typeof window.hermesAPI;
    render(
      <RemoteExpertSelector
        selected={null}
        gateUnavailable
        onChange={() => undefined}
      />,
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole("combobox").closest("label")?.getAttribute("title"),
    ).toBe("Remote Expert is unavailable. Sending is blocked.");
  });
});
