/**
 * v8.0.5 — Forward Clarify / Approval decisions to Hermes Gateway.
 *
 * Priority: native Command API (reserved) → structured follow-up message.
 * Returns GATEWAY_UNSUPPORTED only when no transport can run.
 */

import { getApiUrl, getRemoteAuthHeader, isGatewayRunningAsync, isRemoteMode } from "../hermes";

export type HermesChatCommandAdapter = {
  respondClarify(input: {
    profileId: string;
    sessionId?: string;
    requestId: string;
    answer: string;
  }): Promise<void>;

  approve(input: {
    profileId: string;
    sessionId?: string;
    requestId: string;
  }): Promise<void>;

  deny(input: {
    profileId: string;
    sessionId?: string;
    requestId: string;
    reason?: string;
  }): Promise<void>;
};

export class HermesChatCommandUnsupportedError extends Error {
  readonly code = "GATEWAY_UNSUPPORTED" as const;
  constructor(message: string) {
    super(message);
    this.name = "HermesChatCommandUnsupportedError";
  }
}

export class HermesChatCommandFailedError extends Error {
  readonly code = "COMMAND_FAILED" as const;
  constructor(message: string) {
    super(message);
    this.name = "HermesChatCommandFailedError";
  }
}

const CLARIFY_PREFIX = "[[hermes.clarify.response]]";
const APPROVAL_PREFIX = "[[hermes.approval.response]]";

function buildClarifyFollowUp(requestId: string, answer: string): string {
  return `${CLARIFY_PREFIX}\nrequest_id: ${requestId}\nanswer: ${answer}`;
}

function buildApprovalFollowUp(
  requestId: string,
  decision: "approved" | "denied",
  reason?: string,
): string {
  const lines = [
    APPROVAL_PREFIX,
    `request_id: ${requestId}`,
    `decision: ${decision}`,
  ];
  if (reason?.trim()) lines.push(`reason: ${reason.trim()}`);
  return lines.join("\n");
}

async function postContinuationMessage(input: {
  profileId: string;
  sessionId?: string;
  message: string;
}): Promise<void> {
  const profile =
    input.profileId === "default" ? undefined : input.profileId.trim() || undefined;

  if (!isRemoteMode() && !(await isGatewayRunningAsync(profile))) {
    throw new HermesChatCommandUnsupportedError(
      "Gateway is not running; cannot continue clarify/approval",
    );
  }

  const base = getApiUrl(profile).replace(/\/+$/, "");
  const url = `${base}/v1/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getRemoteAuthHeader(profile),
  };

  const body: Record<string, unknown> = {
    stream: false,
    messages: [{ role: "user", content: input.message }],
  };
  if (input.sessionId?.trim()) {
    body.session_id = input.sessionId.trim();
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new HermesChatCommandFailedError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HermesChatCommandFailedError(
      `Gateway continuation failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

export function createHermesChatCommandAdapter(): HermesChatCommandAdapter {
  return {
    async respondClarify(input) {
      await postContinuationMessage({
        profileId: input.profileId,
        sessionId: input.sessionId,
        message: buildClarifyFollowUp(input.requestId, input.answer),
      });
    },
    async approve(input) {
      await postContinuationMessage({
        profileId: input.profileId,
        sessionId: input.sessionId,
        message: buildApprovalFollowUp(input.requestId, "approved"),
      });
    },
    async deny(input) {
      await postContinuationMessage({
        profileId: input.profileId,
        sessionId: input.sessionId,
        message: buildApprovalFollowUp(
          input.requestId,
          "denied",
          input.reason,
        ),
      });
    },
  };
}

/** Exported for unit tests. */
export const __test = {
  buildClarifyFollowUp,
  buildApprovalFollowUp,
  CLARIFY_PREFIX,
  APPROVAL_PREFIX,
};
