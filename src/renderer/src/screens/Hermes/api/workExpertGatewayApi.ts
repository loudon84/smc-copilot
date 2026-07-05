import type { CallCatalogSkillResult } from "../../../../../shared/hermes-experts/hermes-experts-contract";
import type {
  ExpertGatewayCallResult,
  OpenAICompatibleExpertPayload,
} from "../../../../../shared/hermes-experts/expert-task-stream-contract";
import { workApi } from "./workApi";
import type {
  ExpertGatewayStatus,
  WorkChatSelectedExpert,
  WorkChatSelectedSkill,
  WorkExpertGatewayCallInput,
  WorkExpertGatewayCallResult,
} from "../types/work-chat";

function expertsApi(): NonNullable<typeof window.hermesExperts> {
  if (!window.hermesExperts) {
    throw new Error("window.hermesExperts is not available");
  }
  return window.hermesExperts;
}

function mapGatewayStatus(health: Awaited<ReturnType<typeof workApi.gateway.health>>): ExpertGatewayStatus {
  if (!health?.ok) return "unavailable";

  if (health.runtimeReady === false && health.callableSkills === 0) {
    return "unavailable";
  }

  return "remote";
}

function mapCallResult(result: CallCatalogSkillResult): ExpertGatewayCallResult {
  if (!result.ok) {
    return {
      ok: false,
      mode: result.mode,
      error: result.message ?? result.errorCode ?? "Expert Gateway call failed",
      errorCode: result.errorCode,
    };
  }

  if (
    result.mode === "event_stream" ||
    result.taskId ||
    result.eventSseUrl ||
    result.streaming === true
  ) {
    return {
      ok: true,
      mode: "event_stream",
      taskId: result.taskId ?? "",
      taskNo: result.taskNo,
      eventSseUrl: result.eventSseUrl ?? "",
      artifactUrl: result.artifactUrl,
      status: result.status ?? "accepted",
      streaming: true,
      rawStructuredContent: result.structuredContent as Record<string, unknown> | undefined,
    };
  }

  return {
    ok: true,
    mode: "sync_result",
    responseText: result.responseText ?? "(empty response)",
    structuredContent: result.structuredContent as Record<string, unknown> | undefined,
  };
}

function buildOpenAIPayload(input: WorkExpertGatewayCallInput): OpenAICompatibleExpertPayload {
  return {
    model: input.modelId ?? "expert-gateway",
    messages: [
      {
        role: "user",
        content: input.prompt,
      },
    ],
    stream: true,
    metadata: {
      source: "copilot-desktop",
      conversation_id: input.sessionId ?? undefined,
      model_id: input.modelId ?? undefined,
      permission_mode: input.permissionMode,
      attachment_ids: input.attachmentIds?.length ? input.attachmentIds : undefined,
    },
  };
}

export const workExpertGatewayApi = {
  async getHealth(): Promise<ExpertGatewayStatus> {
    try {
      const health = await workApi.gateway.health();
      return mapGatewayStatus(health);
    } catch {
      return "error";
    }
  },

  async listAuthorizedExperts(): Promise<WorkChatSelectedExpert[]> {
    const experts = await workApi.experts.list();
    return experts.map((e) => ({
      expertId: e.id,
      slug: e.slug,
      name: e.displayName,
      description: e.description,
      category: e.category,
      riskLevel: e.riskLevel,
    }));
  },

  async listExpertSkills(expertSlug: string): Promise<WorkChatSelectedSkill[]> {
    const skills = await workApi.experts.listCatalogSkills(expertSlug);
    return skills.map((s) => ({
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      riskLevel: s.riskLevel,
      outputFormat: s.outputFormat,
    }));
  },

  /** @deprecated v7.6 — business Chat must not call Expert Gateway directly. Debug / Workbench only. */
  async callExpertSkill(input: WorkExpertGatewayCallInput): Promise<WorkExpertGatewayCallResult> {
    try {
      const payload = buildOpenAIPayload(input);
      const result = await expertsApi().callCatalogSkill({
        slug: input.expertSlug,
        catalogKind: "expert",
        skillName: input.skillName,
        prompt: input.prompt,
        sessionId: input.sessionId ?? undefined,
        payload,
      });

      const mapped = mapCallResult(result);
      if (!mapped.ok) {
        return {
          ok: false,
          error: mapped.error,
          errorCode: mapped.errorCode,
        };
      }

      if (mapped.mode === "event_stream") {
        return {
          ok: true,
          mode: "event_stream",
          taskId: mapped.taskId,
          taskNo: mapped.taskNo,
          eventSseUrl: mapped.eventSseUrl,
          artifactUrl: mapped.artifactUrl,
          status: mapped.status,
          streaming: true,
          runId: result.runId,
        };
      }

      return {
        ok: true,
        mode: "sync_result",
        responseText: mapped.responseText,
        runId: result.runId,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export type { ExpertGatewayCallResult };
