/**
 * Per-run Work context — Expert / Skill / Permission bound to a ChatRunRecord.
 * Replaces Host-local useWorkChatContext for multi-run isolation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChatWorkspace } from "./ChatWorkspaceProvider";
import type { ChatRunRecord } from "./ChatRunRecord";

export type RunWorkGatewayStatus =
  | "unknown"
  | "checking"
  | "remote"
  | "unavailable"
  | "error";

export type RunWorkSelectedExpert = {
  expertId: string;
  slug: string;
  name: string;
  description?: string;
  category?: string;
  riskLevel?: "low" | "medium" | "high";
  runtimeProfile?: string;
  runtimeInstanceId?: string;
};

export type RunWorkSelectedSkill = {
  name: string;
  displayName: string;
  description?: string;
  riskLevel?: "low" | "medium" | "high";
  outputFormat?: "markdown" | "json" | "text" | "file";
};

export type RunWorkChatContext = {
  gatewayStatus: RunWorkGatewayStatus;
  selectedExpert: RunWorkSelectedExpert | null;
  selectedSkill: RunWorkSelectedSkill | null;
  permissionMode: "default" | "ask_each_time";
  workMode: "ask" | "plan" | "craft";
  mode: ChatRunRecord["context"]["mode"];
  useExpertGateway: false;
  setExpert: (expert: RunWorkSelectedExpert | null) => void;
  setSkill: (skill: RunWorkSelectedSkill | null) => void;
  setPermissionMode: (mode: "default" | "ask_each_time") => void;
  setWorkMode: (mode: "ask" | "plan" | "craft") => void;
  clearContext: () => void;
  refreshGatewayHealth: () => Promise<void>;
};

type HealthApi = {
  getHealth: () => Promise<RunWorkGatewayStatus>;
};

/**
 * Optional health probe injection keeps modules/chat free of screens API imports.
 * Host/screens can call setRunWorkGatewayHealthApi once at boot.
 */
let healthApi: HealthApi | null = null;

export function setRunWorkGatewayHealthApi(api: HealthApi | null): void {
  healthApi = api;
}

export function useRunWorkContext(runId: string): RunWorkChatContext {
  const { getRun, patchRun, returnDefault } = useChatWorkspace();
  const run = getRun(runId);
  const [gatewayStatus, setGatewayStatus] =
    useState<RunWorkGatewayStatus>("unknown");

  const refreshGatewayHealth = useCallback(async () => {
    if (!healthApi) {
      setGatewayStatus("unknown");
      return;
    }
    setGatewayStatus("checking");
    try {
      const status = await healthApi.getHealth();
      setGatewayStatus(status);
    } catch {
      setGatewayStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshGatewayHealth();
  }, [refreshGatewayHealth]);

  const selectedExpert = useMemo<RunWorkSelectedExpert | null>(() => {
    if (!run?.context.expertId) return null;
    return {
      expertId: run.context.expertId,
      slug: run.context.expertId,
      name: run.context.expertName || run.context.expertId,
      runtimeProfile: run.identity.profileId,
    };
  }, [run]);

  const selectedSkill = useMemo<RunWorkSelectedSkill | null>(() => {
    if (!run?.context.skillName) return null;
    return {
      name: run.context.skillName,
      displayName: run.context.skillDisplayName || run.context.skillName,
    };
  }, [run]);

  const setExpert = useCallback(
    (expert: RunWorkSelectedExpert | null) => {
      if (!expert) {
        patchRun(runId, {
          context: {
            mode: "default",
            expertId: undefined,
            expertName: undefined,
            skillName: undefined,
            skillDisplayName: undefined,
          },
          execution: { invocationSource: "default_chat", expertRunId: undefined },
        });
        return;
      }
      patchRun(runId, {
        context: {
          mode: "expert",
          expertId: expert.expertId,
          expertName: expert.name,
          teamId: undefined,
          teamName: undefined,
          skillName: undefined,
          skillDisplayName: undefined,
        },
        identity: {
          profileId: expert.runtimeProfile || "default",
        },
        execution: {
          invocationSource: "expert_chat",
        },
      });
    },
    [patchRun, runId],
  );

  const setSkill = useCallback(
    (skill: RunWorkSelectedSkill | null) => {
      patchRun(runId, {
        context: {
          skillName: skill?.name,
          skillDisplayName: skill?.displayName,
        },
      });
    },
    [patchRun, runId],
  );

  const setPermissionMode = useCallback(
    (mode: "default" | "ask_each_time") => {
      patchRun(runId, { context: { permissionMode: mode } });
    },
    [patchRun, runId],
  );

  const setWorkMode = useCallback(
    (mode: "ask" | "plan" | "craft") => {
      patchRun(runId, { context: { workMode: mode } });
    },
    [patchRun, runId],
  );

  const clearContext = useCallback(() => {
    returnDefault(runId);
  }, [returnDefault, runId]);

  return {
    gatewayStatus,
    selectedExpert,
    selectedSkill,
    permissionMode: run?.context.permissionMode ?? "default",
    workMode: run?.context.workMode ?? "ask",
    mode: run?.context.mode ?? "default",
    useExpertGateway: false as const,
    setExpert,
    setSkill,
    setPermissionMode,
    setWorkMode,
    clearContext,
    refreshGatewayHealth,
  };
}
