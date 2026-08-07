import { copilotServeFetch, type CopilotServeHttpConfig } from "./http-client";
import type { ApprovalRecord } from "./types";

export async function listPendingApprovals(
  config: CopilotServeHttpConfig,
): Promise<ApprovalRecord[]> {
  return copilotServeFetch<ApprovalRecord[]>(config, "/api/v1/approvals/pending");
}

export async function approve(
  config: CopilotServeHttpConfig,
  approvalId: string,
): Promise<ApprovalRecord> {
  return copilotServeFetch<ApprovalRecord>(config, `/api/v1/approvals/${approvalId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function reject(
  config: CopilotServeHttpConfig,
  approvalId: string,
  reason?: string,
): Promise<ApprovalRecord> {
  return copilotServeFetch<ApprovalRecord>(config, `/api/v1/approvals/${approvalId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
