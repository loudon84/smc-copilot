import type { HermesExpertTrustStatus } from "../../shared/hermes-experts/hermes-experts-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import { getExpertInstance } from "./expert-runtime-db";

export function assertExpertTrusted(expertId: string): void {
  const instance = getExpertInstance(expertId);
  if (!instance) return;
  if (instance.trustStatus === "blocked" || instance.trustStatus === "disabled") {
    throw new HermesExpertsError("EXPERT_POLICY_BLOCKED", `Expert ${expertId} is ${instance.trustStatus}`);
  }
  if (instance.trustStatus === "untrusted") {
    throw new HermesExpertsError(
      "EXPERT_TRUST_REQUIRED",
      "Expert must be trusted before high-risk actions",
    );
  }
}

export function assertChatSendAllowed(expertId: string): void {
  const instance = getExpertInstance(expertId);
  if (!instance) return;
  if (instance.trustStatus === "blocked" || instance.trustStatus === "disabled") {
    throw new HermesExpertsError("EXPERT_POLICY_BLOCKED", `Expert ${expertId} is ${instance.trustStatus}`);
  }
}

export function assertToolProgressAllowed(expertId: string, toolLabel: string): void {
  const instance = getExpertInstance(expertId);
  if (!instance) return;
  if (instance.trustStatus === "blocked" || instance.trustStatus === "disabled") {
    throw new HermesExpertsError("EXPERT_POLICY_BLOCKED", `Expert ${expertId} is ${instance.trustStatus}`);
  }
  const isWriteLike = /write|delete|update|create|mutate|upload|submit|pay/i.test(toolLabel);
  if (isWriteLike && instance.trustStatus === "untrusted") {
    throw new HermesExpertsError(
      "EXPERT_TRUST_REQUIRED",
      "Trust this expert to allow write tools and MCP mutations",
    );
  }
}

export function canExecuteHighRisk(expertId: string): boolean {
  const instance = getExpertInstance(expertId);
  if (!instance) return false;
  return instance.trustStatus === "trusted";
}

export function normalizeTrustStatus(status: HermesExpertTrustStatus): HermesExpertTrustStatus {
  return status;
}
