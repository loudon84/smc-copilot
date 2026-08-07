import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { getProfile, getRuntimeInstance, insertDelegationEvent, insertAuditEvent, generateId } from "./profile-runtime-db";
import { profileHome } from "./config-importer";
import type { DelegateToProfileRequest, DelegateToProfileResult } from "../shared/profile-runtime/profile-runtime-contract";
import { ProfileRuntimeError } from "../shared/profile-runtime/profile-runtime-errors";

const DELEGATION_TIMEOUT_MS = 30_000;

function resolveContextRefs(contextRefs: string[]): string {
  const parts: string[] = [];
  for (const ref of contextRefs) {
    try {
      const [profileId, sessionId] = ref.split("/");
      if (!profileId || !sessionId) continue;
      const home = profileHome(profileId);
      const ctxDir = join(home, "desktop", "shared-context");
      if (!existsSync(ctxDir)) continue;
      for (const file of readdirSync(ctxDir)) {
        if (file.includes(sessionId) && file.endsWith(".md")) {
          const content = readFileSync(join(ctxDir, file), "utf-8");
          parts.push(content);
        }
      }
    } catch { /* skip invalid refs */ }
  }
  return parts.join("\n\n---\n\n");
}

export async function invoke(request: DelegateToProfileRequest): Promise<DelegateToProfileResult> {
  const sourceProfile = getProfile(request.fromProfile);
  if (!sourceProfile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", request.fromProfile);

  const targetProfile = getProfile(request.toProfile);
  if (!targetProfile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", request.toProfile);

  const targetInstance = getRuntimeInstance(request.toProfile);
  if (!targetInstance || targetInstance.status !== "running") {
    throw new ProfileRuntimeError("PROFILE_RUNTIME_NOT_DEPLOYED", request.toProfile);
  }

  let enrichedMessage = request.message;
  if (request.includeContextRefs && request.includeContextRefs.length > 0) {
    const contextContent = resolveContextRefs(request.includeContextRefs);
    if (contextContent) {
      enrichedMessage = `${request.message}\n\n--- Shared Context ---\n${contextContent}`;
    }
  }

  const eventId = generateId();
  const startedAt = new Date().toISOString();

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: enrichedMessage }],
      stream: false,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELEGATION_TIMEOUT_MS);

    const res = await fetch(`${targetInstance.base_url}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errResult: DelegateToProfileResult = {
        ok: false,
        fromProfile: request.fromProfile,
        toProfile: request.toProfile,
        errorCode: "PROFILE_DELEGATION_FAILED",
        message: `HTTP ${res.status}`,
      };
      insertDelegationEvent({
        id: eventId,
        from_profile_id: request.fromProfile,
        to_profile_id: request.toProfile,
        request_message: request.message.slice(0, 500),
        context_refs_json: request.includeContextRefs ? JSON.stringify(request.includeContextRefs) : null,
        response_summary: null,
        target_session_id: null,
        status: "failed",
        error_message: `HTTP ${res.status}`,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });
      return errResult;
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const response = data.choices?.[0]?.message?.content ?? "";
    const targetSessionId = res.headers.get("x-hermes-session-id") ?? undefined;

    insertDelegationEvent({
      id: eventId,
      from_profile_id: request.fromProfile,
      to_profile_id: request.toProfile,
      request_message: request.message.slice(0, 500),
      context_refs_json: request.includeContextRefs ? JSON.stringify(request.includeContextRefs) : null,
      response_summary: response.slice(0, 500),
      target_session_id: targetSessionId ?? null,
      status: "completed",
      error_message: null,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    insertAuditEvent({
      id: generateId(),
      event_type: "delegation",
      profile_id: request.fromProfile,
      source: "hermes",
      action: "delegate_to_profile",
      payload_json: JSON.stringify({ to: request.toProfile, hasContextRefs: !!request.includeContextRefs?.length }),
      status: "success",
      error_message: null,
    });

    return {
      ok: true,
      fromProfile: request.fromProfile,
      toProfile: request.toProfile,
      response,
      targetSessionId,
    };
  } catch (e) {
    insertDelegationEvent({
      id: eventId,
      from_profile_id: request.fromProfile,
      to_profile_id: request.toProfile,
      request_message: request.message.slice(0, 500),
      context_refs_json: request.includeContextRefs ? JSON.stringify(request.includeContextRefs) : null,
      response_summary: null,
      target_session_id: null,
      status: "failed",
      error_message: String(e),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    return {
      ok: false,
      fromProfile: request.fromProfile,
      toProfile: request.toProfile,
      errorCode: "PROFILE_DELEGATION_FAILED",
      message: String(e),
    };
  }
}
