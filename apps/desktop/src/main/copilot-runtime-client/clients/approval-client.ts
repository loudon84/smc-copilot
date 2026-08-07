import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 5. */
export const approvalClient = {
  list: () => runtimeFetch({ path: "/api/v1/approvals" }),
  decide: (approvalId: string, body: Record<string, unknown>) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/approvals/${encodeURIComponent(approvalId)}/decide`,
      body,
    }),
};
