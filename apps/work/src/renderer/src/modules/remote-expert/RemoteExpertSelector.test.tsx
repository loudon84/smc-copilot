// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RemoteExpertSelector } from "./RemoteExpertSelector";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "chat.remoteExpert.label": "Remote Expert",
        "chat.remoteExpert.localChat": "Local chat",
        "chat.remoteExpert.unavailable": "unavailable",
        "chat.remoteExpert.checking": "Checking Remote Experts…",
        "chat.remoteExpert.unavailableEntry": "Remote Expert unavailable",
        "chat.remoteExpert.incompatible":
          "Remote Expert contract incompatible (expected 2.1.0). Local chat remains available.",
        "chat.remoteExpert.noExperts": "No Remote Experts available",
        "chat.remoteExpert.catalogUnavailable": "Catalog unavailable",
        "chat.remoteExpert.gateUnavailable":
          "Remote Expert is unavailable. Sending is blocked.",
      }[key] ?? key),
  }),
}));

const sales = {
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
};

const unavailable = {
  ...sales,
  agentRef: "down-expert",
  displayName: "Down Expert",
  status: "unavailable" as const,
};

describe("RemoteExpertSelector", () => {
  it("[A-UI-001] [A-CATALOG-READY-001] renders ready enabled and unavailable disabled", () => {
    render(
      <RemoteExpertSelector
        selectedAgentRef={null}
        items={[sales, unavailable]}
        availabilityStatus="compatible"
        catalogStatus="ready"
        onChange={() => undefined}
      />,
    );
    const ready = screen.getByRole("option", {
      name: "Sales Expert",
    }) as HTMLOptionElement;
    const down = screen.getByRole("option", {
      name: /Down Expert/,
    }) as HTMLOptionElement;
    expect(ready.disabled).toBe(false);
    expect(down.disabled).toBe(true);
  });

  it("[A-NEG-UI-ENTRY-001] greys out the selector when gate is unavailable", () => {
    render(
      <RemoteExpertSelector
        selectedAgentRef={null}
        items={[]}
        availabilityStatus="unavailable"
        catalogStatus="idle"
        onChange={() => undefined}
      />,
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole("combobox").closest("label")?.getAttribute("title"),
    ).toBe("Remote Expert unavailable");
  });

  it("[A-NEG-CATALOG-GATE-001] does not call listCatalog (pure presentational)", () => {
    const listCatalog = vi.fn();
    window.hermesAPI = {
      ...window.hermesAPI,
      remoteExpert: {
        ...(window.hermesAPI?.remoteExpert ?? {}),
        listCatalog,
      },
    } as typeof window.hermesAPI;
    render(
      <RemoteExpertSelector
        selectedAgentRef={null}
        items={[]}
        availabilityStatus="incompatible"
        catalogStatus="idle"
        onChange={() => undefined}
      />,
    );
    expect(listCatalog).not.toHaveBeenCalled();
  });

  it("[A-NEG-SEC-CLOSURE-004] renders catalog labels as text, not HTML", () => {
    const evil = {
      ...sales,
      agentRef: "evil",
      displayName: "<img src=x onerror=alert(1)>",
    };
    render(
      <RemoteExpertSelector
        selectedAgentRef={null}
        items={[evil]}
        availabilityStatus="compatible"
        catalogStatus="ready"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("[A-CATALOG-EMPTY-001] keeps local chat option when catalog empty", () => {
    const onChange = vi.fn();
    render(
      <RemoteExpertSelector
        selectedAgentRef={null}
        items={[]}
        availabilityStatus="compatible"
        catalogStatus="empty"
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Local chat")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
