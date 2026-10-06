// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import { mintRun, type ChatRun } from "./chatRuns";
import { useRemoteExpertRunTransition } from "./useRemoteExpertRunTransition";

describe("useRemoteExpertRunTransition", () => {
  it("[A-NEG-UI-SWITCH-001] cancel confirmation commits 0 mutation", () => {
    const confirm = vi.fn(() => false);
    const { result } = renderHook(() => {
      const [runs, setRuns] = useState<ChatRun[]>([
        {
          ...mintRun("alfie"),
          sessionId: "sess-1",
          title: "hello",
        },
      ]);
      const [activeRunId, setActiveRunId] = useState(runs[0]!.runId);
      const api = useRemoteExpertRunTransition({
        runs,
        activeRunId,
        setRuns,
        setActiveRunId,
        profile: "alfie",
        confirm,
        t: (key) => key,
      });
      return { runs, activeRunId, api };
    });

    const before = structuredClone(result.current.runs);
    const beforeId = result.current.activeRunId;
    act(() => {
      result.current.api.selectRemoteExpert(beforeId, {
        kind: "remote",
        agentRef: "finance-expert",
      });
    });
    expect(confirm).toHaveBeenCalled();
    expect(result.current.runs).toEqual(before);
    expect(result.current.activeRunId).toBe(beforeId);
  });

  it("[A-UI-SWITCH-001] confirm creates remote scratch with agent_ref", () => {
    const confirm = vi.fn(() => true);
    const { result } = renderHook(() => {
      const [runs, setRuns] = useState<ChatRun[]>([
        {
          ...mintRun("alfie"),
          sessionId: "sess-1",
          title: "hello",
        },
      ]);
      const [activeRunId, setActiveRunId] = useState(runs[0]!.runId);
      const api = useRemoteExpertRunTransition({
        runs,
        activeRunId,
        setRuns,
        setActiveRunId,
        profile: "alfie",
        confirm,
        t: (key) => key,
      });
      return { runs, activeRunId, api };
    });

    act(() => {
      result.current.api.selectRemoteExpert(result.current.activeRunId, {
        kind: "remote",
        agentRef: "finance-expert",
      });
    });
    expect(result.current.runs).toHaveLength(2);
    const active = result.current.runs.find(
      (r) => r.runId === result.current.activeRunId,
    );
    expect(active).toMatchObject({
      executionMode: "remote-expert",
      remoteExpertAgentRef: "finance-expert",
      sessionId: null,
    });
  });
});
