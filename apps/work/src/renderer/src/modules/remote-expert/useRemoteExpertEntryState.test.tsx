// @vitest-environment jsdom
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteExpertEntryState } from "./useRemoteExpertEntryState";
import { isRemoteExpertEntryVisible } from "./entry-eligibility";

describe("useRemoteExpertEntryState", () => {
  beforeEach(() => {
    window.hermesAPI = {
      remoteExpert: {
        getAvailability: vi.fn(),
        listCatalog: vi.fn(),
      },
    } as unknown as typeof window.hermesAPI;
  });

  afterEach(() => {
    cleanup();
  });

  it("[A-CATALOG-GATE-001] loads catalog only after compatible", async () => {
    const getAvailability = vi.fn(async () => ({
      enabled: true,
      gateState: "COMPATIBLE" as const,
      packed: false,
    }));
    const listCatalog = vi.fn(async () => ({
      items: [
        {
          agentRef: "sales-expert",
          displayName: "Sales",
          description: null,
          category: null,
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
    window.hermesAPI.remoteExpert.getAvailability = getAvailability;
    window.hermesAPI.remoteExpert.listCatalog = listCatalog;

    const { result } = renderHook(() => useRemoteExpertEntryState());
    await waitFor(() =>
      expect(result.current.availabilityStatus).toBe("compatible"),
    );
    await waitFor(() => expect(result.current.catalogStatus).toBe("ready"));
    expect(listCatalog).toHaveBeenCalledTimes(1);
    expect(result.current.items[0]?.agentRef).toBe("sales-expert");
  });

  it("[A-NEG-CATALOG-GATE-001] incompatible keeps catalog idle with 0 list calls", async () => {
    window.hermesAPI.remoteExpert.getAvailability = vi.fn(async () => ({
      enabled: false,
      gateState: "INCOMPATIBLE" as const,
      packed: false,
      errorCode: "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
    }));
    const listCatalog = vi.fn(async () => ({ items: [] }));
    window.hermesAPI.remoteExpert.listCatalog = listCatalog;

    const { result } = renderHook(() => useRemoteExpertEntryState());
    await waitFor(() =>
      expect(result.current.availabilityStatus).toBe("incompatible"),
    );
    expect(result.current.catalogStatus).toBe("idle");
    expect(listCatalog).toHaveBeenCalledTimes(0);
  });

  it("[A-OBS-CLOSURE-001] records sanitized lastOperation without credentials", async () => {
    window.hermesAPI.remoteExpert.getAvailability = vi.fn(async () => ({
      enabled: false,
      gateState: "UNRESOLVED" as const,
      packed: false,
      errorCode: "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
    }));
    const { result } = renderHook(() => useRemoteExpertEntryState());
    await waitFor(() =>
      expect(result.current.availabilityStatus).toBe("unavailable"),
    );
    expect(result.current.lastOperation?.errorCode).toBe(
      "REMOTE_EXPERT_DISCOVERY_UNAVAILABLE",
    );
    expect(JSON.stringify(result.current.lastOperation)).not.toMatch(
      /Bearer|access_token|refresh_token/i,
    );
  });

  it("[A-STATE-AVAIL-001] retryAvailability re-checks and can load catalog", async () => {
    let n = 0;
    window.hermesAPI.remoteExpert.getAvailability = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("down");
      return { enabled: true, gateState: "COMPATIBLE" as const, packed: false };
    });
    window.hermesAPI.remoteExpert.listCatalog = vi.fn(async () => ({
      items: [],
    }));
    const { result } = renderHook(() => useRemoteExpertEntryState());
    await waitFor(() =>
      expect(result.current.availabilityStatus).toBe("unavailable"),
    );
    await act(async () => {
      result.current.retryAvailability();
    });
    await waitFor(() =>
      expect(result.current.availabilityStatus).toBe("compatible"),
    );
    await waitFor(() => expect(result.current.catalogStatus).toBe("empty"));
  });
});

describe("isRemoteExpertEntryVisible", () => {
  it("[A-NEG-UI-ENTRY-002] false for skill-run and knowledgeRequired", () => {
    expect(
      isRemoteExpertEntryVisible({ executionMode: "skill-run" }),
    ).toBe(false);
    expect(
      isRemoteExpertEntryVisible({
        executionMode: "local-chat",
        knowledgeRequired: true,
      }),
    ).toBe(false);
    expect(
      isRemoteExpertEntryVisible({ executionMode: "local-chat" }),
    ).toBe(true);
  });
});
