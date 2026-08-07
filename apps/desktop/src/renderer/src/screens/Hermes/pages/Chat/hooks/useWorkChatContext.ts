import { useCallback, useEffect, useState } from "react";
import { workExpertGatewayApi } from "../../../api/workExpertGatewayApi";
import type {
  ExpertGatewayStatus,
  UseWorkChatContextReturn,
  WorkChatSelectedExpert,
  WorkChatSelectedSkill,
  WorkPermissionMode,
} from "../../../types/work-chat";

export function useWorkChatContext(): UseWorkChatContextReturn {
  const [gatewayStatus, setGatewayStatus] = useState<ExpertGatewayStatus>("unknown");
  const [selectedExpert, setSelectedExpert] = useState<WorkChatSelectedExpert | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<WorkChatSelectedSkill | null>(null);
  const [permissionMode, setPermissionModeState] = useState<WorkPermissionMode>("default");

  const refreshGatewayHealth = useCallback(async () => {
    setGatewayStatus("checking");
    const status = await workExpertGatewayApi.getHealth();
    setGatewayStatus(status);
  }, []);

  useEffect(() => {
    void refreshGatewayHealth();
  }, [refreshGatewayHealth]);

  const setExpert = useCallback((expert: WorkChatSelectedExpert | null) => {
    setSelectedExpert(expert);
    setSelectedSkill(null);
  }, []);

  const setSkill = useCallback((skill: WorkChatSelectedSkill | null) => {
    setSelectedSkill(skill);
  }, []);

  const setPermissionMode = useCallback((mode: WorkPermissionMode) => {
    setPermissionModeState(mode);
  }, []);

  const clearContext = useCallback(() => {
    setSelectedExpert(null);
    setSelectedSkill(null);
    setPermissionModeState("default");
  }, []);

  return {
    gatewayStatus,
    selectedExpert,
    selectedSkill,
    permissionMode,
    useExpertGateway: false as const,
    setExpert,
    setSkill,
    setPermissionMode,
    clearContext,
    refreshGatewayHealth,
  };
}
