import type {
  CallCatalogSkillInput,
  CallCatalogSkillResult,
  SummonExpertInput,
  SummonExpertResult,
} from "../../shared/hermes-experts/hermes-experts-contract";
import type { OpenAICompatibleExpertPayload } from "../../shared/hermes-experts/expert-task-stream-contract";
import { isHermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";
import { getExpert } from "./expert-catalog-client";
import { getMockExpert } from "./expert-mock-catalog";
import {
  buildExpertToolArguments,
  getExpertMcpClient,
  listCatalogSkills,
  resolveDefaultExpertSkill,
} from "./expert-mcp-client";
import { extractTextContent } from "./expert-mcp-mappers";
import {
  createExpertRun,
  insertArtifact,
  insertRunEvent,
  setExpertRunRemoteTaskId,
  updateExpertRunStatus,
} from "./expert-runtime-db";
import { emitExpertRuntimeEvent } from "./expert-run-events";
import { resolveExpertTaskUrl } from "./expert-task-url";

function buildArtifactTitle(
  catalogKind: CallCatalogSkillInput["catalogKind"],
  displayName: string,
  skillDisplayName: string,
): string {
  if (catalogKind === "expert_team") {
    return `${displayName} - 团队结果`;
  }
  return `${displayName} - ${skillDisplayName}`;
}

function resolvePromptFromInput(input: CallCatalogSkillInput): string {
  const direct = input.prompt?.trim();
  if (direct) return direct;
  const messages = input.payload?.messages;
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role === "user" && msg.content.trim()) {
      return msg.content.trim();
    }
  }
  return "";
}

function resolveCallArguments(
  input: CallCatalogSkillInput,
  prompt: string,
): OpenAICompatibleExpertPayload | ReturnType<typeof buildExpertToolArguments> {
  if (input.payload?.messages?.length) {
    return {
      ...input.payload,

      /**
       * Compatibility field for current Expert MCP Gateway.
       * v7.5 source of truth remains payload.messages.
       * Remove after nodeskclaw fully supports OpenAI-compatible tools/call arguments.
       */
      prompt,
    } as OpenAICompatibleExpertPayload & { prompt: string };
  }
  return buildExpertToolArguments({ prompt, context: input.context as never });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseEventStreamAccepted(structured: Record<string, unknown> | undefined): {
  taskId: string;
  taskNo?: string;
  eventSseUrl: string;
  artifactUrl?: string;
  status: "accepted" | "queued" | "running";
} | null {
  if (!structured) return null;
  const taskId = String(structured.taskId ?? structured.task_id ?? "").trim();
  const eventSseUrlRaw = String(
    structured.eventSseUrl ?? structured.event_sse_url ?? structured.event_stream ?? "",
  ).trim();
  const streaming = structured.streaming === true;
  if (!taskId && !eventSseUrlRaw && !streaming) return null;
  if (!taskId || !eventSseUrlRaw) return null;

  const rawStatus = String(structured.status ?? "accepted");
  const status =
    rawStatus === "queued" || rawStatus === "running" ? rawStatus : "accepted";

  const artifactUrlRaw =
    structured.artifactUrl != null
      ? String(structured.artifactUrl)
      : structured.artifact_url != null
        ? String(structured.artifact_url)
        : undefined;

  const eventSseUrl = resolveExpertTaskUrl(eventSseUrlRaw) ?? eventSseUrlRaw;

  return {
    taskId,
    taskNo: structured.taskNo != null ? String(structured.taskNo) : structured.task_no != null ? String(structured.task_no) : undefined,
    eventSseUrl,
    artifactUrl: resolveExpertTaskUrl(artifactUrlRaw) ?? artifactUrlRaw,
    status,
  };
}

export async function callCatalogSkill(
  input: CallCatalogSkillInput,
): Promise<CallCatalogSkillResult> {
  const prompt = resolvePromptFromInput(input);
  const skillName = input.skillName.trim();
  const slug = input.slug.trim();

  if (!slug) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "slug is required" };
  }
  if (!skillName) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "skillName is required" };
  }
  if (!prompt && !input.payload?.messages?.length) {
    return { ok: false, errorCode: "EXPERT_PROMPT_REQUIRED", message: "prompt is required" };
  }

  const run = createExpertRun({
    runType: input.catalogKind === "expert_team" ? "team" : "single_expert",
    expertId: input.catalogKind === "expert" ? slug : undefined,
    teamId: input.catalogKind === "expert_team" ? slug : undefined,
    profileId: "remote",
    sessionId: input.sessionId,
    title: slug,
    userPrompt: prompt || "(expert payload)",
    status: "running",
    catalogSlug: slug,
    catalogKind: input.catalogKind,
    skillName,
    executionMode: "remote_mcp",
  });

  insertRunEvent({
    runId: run.runId,
    eventType: "mcp.call.started",
    payload: {
      slug,
      catalogKind: input.catalogKind,
      skillName,
    },
  });

  try {
    const result = await getExpertMcpClient().callSkill({
      slug,
      skillName,
      arguments: resolveCallArguments(input, prompt),
    });

    const responseText = extractTextContent(result);
    const structuredContent = result.structuredContent;
    const structuredRecord = asRecord(structuredContent);
    const accepted = parseEventStreamAccepted(structuredRecord);

    if (accepted) {
      setExpertRunRemoteTaskId(run.runId, accepted.taskId);
      updateExpertRunStatus(run.runId, "running", {
        structuredContentJson: structuredContent ? JSON.stringify(structuredContent) : undefined,
      });
      insertRunEvent({
        runId: run.runId,
        eventType: "mcp.call.accepted",
        payload: {
          slug,
          catalogKind: input.catalogKind,
          skillName,
          taskId: accepted.taskId,
          eventSseUrl: accepted.eventSseUrl,
        },
      });
      emitExpertRuntimeEvent({
        type: "run_updated",
        runId: run.runId,
        payload: { status: "running", taskId: accepted.taskId },
      });

      return {
        ok: true,
        runId: run.runId,
        mode: "event_stream",
        taskId: accepted.taskId,
        taskNo: accepted.taskNo,
        eventSseUrl: accepted.eventSseUrl,
        artifactUrl: accepted.artifactUrl,
        status: accepted.status,
        streaming: true,
        structuredContent,
      };
    }

    if (!responseText && !structuredContent) {
      updateExpertRunStatus(run.runId, "failed", {
        errorCode: "EXPERT_RESPONSE_EMPTY",
        errorMessage: "Expert MCP returned empty response",
      });
      insertRunEvent({
        runId: run.runId,
        eventType: "mcp.call.failed",
        payload: { slug, catalogKind: input.catalogKind, skillName, errorCode: "EXPERT_RESPONSE_EMPTY" },
      });
      emitExpertRuntimeEvent({
        type: "run_updated",
        runId: run.runId,
        payload: { status: "failed" },
      });
      return {
        ok: false,
        runId: run.runId,
        errorCode: "EXPERT_RESPONSE_EMPTY",
        message: "Expert MCP returned empty response",
      };
    }

    updateExpertRunStatus(run.runId, "completed", {
      resultSummary: responseText,
      structuredContentJson: structuredContent ? JSON.stringify(structuredContent) : undefined,
      invocationId: structuredContent?.invocationId,
    });

    insertRunEvent({
      runId: run.runId,
      eventType: "mcp.call.completed",
      payload: {
        slug,
        catalogKind: input.catalogKind,
        skillName,
        structuredContent,
      },
    });

    const skills = await listCatalogSkills(slug);
    const skillMeta = skills.find((s) => s.skillName === skillName);
    const artifactTitle = buildArtifactTitle(
      input.catalogKind,
      slug,
      skillMeta?.displayName ?? skillName,
    );

    if (responseText) {
      const artifact = insertArtifact({
        runId: run.runId,
        profileId: "remote",
        title: artifactTitle,
        artifactType: "markdown",
        previewText: responseText.slice(0, 4000),
        mimeType: "text/markdown",
        source: "expert_mcp_response",
      });
      emitExpertRuntimeEvent({
        type: "artifact_created",
        runId: run.runId,
        payload: { artifactId: artifact.id },
      });
    }

    emitExpertRuntimeEvent({
      type: "run_updated",
      runId: run.runId,
      payload: { status: "completed" },
    });

    const { reportExpertRunIfConfigured } = await import("./expert-desktop-client");
    void reportExpertRunIfConfigured(run.runId);

    return {
      ok: true,
      runId: run.runId,
      mode: "sync_result",
      responseText,
      structuredContent,
    };
  } catch (err) {
    const errorCode = isHermesExpertsError(err) ? err.code : "EXPERT_MCP_CALL_FAILED";
    const message = err instanceof Error ? err.message : String(err);

    updateExpertRunStatus(run.runId, "failed", {
      errorCode,
      errorMessage: message,
    });

    insertRunEvent({
      runId: run.runId,
      eventType: "mcp.call.failed",
      payload: {
        slug,
        catalogKind: input.catalogKind,
        skillName,
        errorCode,
        message,
      },
    });

    emitExpertRuntimeEvent({
      type: "run_updated",
      runId: run.runId,
      payload: { status: "failed" },
    });

    return {
      ok: false,
      runId: run.runId,
      errorCode,
      message,
    };
  }
}

function resolveExpertSlug(expert: NonNullable<Awaited<ReturnType<typeof getExpert>>>): string {
  return (expert.catalogSlug ?? expert.expertSlug ?? expert.slug ?? expert.expertId).trim();
}

export async function summonExpert(input: SummonExpertInput): Promise<SummonExpertResult> {
  const expert = (await getExpert(input.expertId)) ?? getMockExpert(input.expertId);
  if (!expert) {
    return { ok: false, errorCode: "EXPERT_NOT_FOUND", message: input.expertId };
  }

  const slug = (input.slug ?? resolveExpertSlug(expert)).trim();
  if (!slug) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: expert.expertId };
  }

  const prompt =
    input.userPrompt?.trim() ||
    expert.starterPrompts[0]?.prompt ||
    `请执行 ${expert.displayName} 任务。`;

  const skillName =
    input.skillName?.trim() ?? (await resolveDefaultExpertSkill(slug, "expert_skill"));
  if (!skillName) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "No callable skill found" };
  }

  const result = await callCatalogSkill({
    slug,
    catalogKind: "expert",
    skillName,
    prompt,
    context: input.context,
    sessionId: input.sessionId,
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.errorCode,
      message: result.message,
      expertId: input.expertId,
      runId: result.runId,
      approvalRequired: result.errorCode === "EXPERT_APPROVAL_REQUIRED",
    };
  }

  return {
    ok: true,
    expertId: input.expertId,
    profileId: "remote",
    runId: result.runId,
    sessionId: input.sessionId,
    runtimeStatus: "running",
    message: `Expert ${expert.displayName} completed`,
  };
}

export async function cancelExpertRun(runId: string): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
  updateExpertRunStatus(runId, "cancelled");
  insertRunEvent({ runId, eventType: "task.cancelled", payload: {} });
  emitExpertRuntimeEvent({ type: "run_updated", runId, payload: { status: "cancelled" } });
  return { ok: true };
}

/** @deprecated Expert MCP Gateway v6 — synchronous runs have no remote task to sync. */
export async function syncExpertRun(runId: string): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
  const { getExpertRun } = await import("./expert-runtime-db");
  const run = getExpertRun(runId);
  if (!run) {
    return { ok: false, errorCode: "EXPERT_RUN_NOT_FOUND", message: runId };
  }
  if (!run.remoteTaskId) {
    return { ok: true };
  }
  const { syncRemoteRunFromTask } = await import("./expert-remote-client");
  await syncRemoteRunFromTask(runId, run.remoteTaskId);
  return { ok: true };
}

export async function resolveDefaultCallableSkill(
  slug: string,
  kind: "expert_skill" | "expert_team_skill",
): Promise<string | null> {
  return resolveDefaultExpertSkill(slug, kind);
}
