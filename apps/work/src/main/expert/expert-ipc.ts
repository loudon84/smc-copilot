/**
 * Expert Main IPC registration — narrow DTO surface only.
 */

import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  EXPERT_IPC_CHANNELS,
  encodeExpertIpcError,
  type ExpertCancelInput,
  type ExpertRequest,
  type ExpertRetryArtifactDiscoveryInput,
  type ExpertRetryInput,
  type ExpertStartInput,
} from "../../shared/expert";
import { ensureFreshAccessToken } from "../auth/ensure-access-token";
import { readStoredSessionSync } from "../auth/token-store";
import {
  rehydrateExpertContinuationsForSession,
  upsertExpertContinuationProjection,
} from "./expert-continuation";
import {
  getExpertGatewayClient,
  ExpertGatewayError,
  resetExpertGatewayClientForTests,
} from "./expert-gateway-client";
import { materializeExpertSessionTranscript } from "./expert-session-materialize";
import {
  getExpertRunService,
  resetExpertRunServiceForTests,
} from "./expert-run-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSender(event: IpcMainInvokeEvent): void {
  const wc = event.sender;
  if (!wc || wc.isDestroyed()) {
    throw new Error("Invalid IPC sender");
  }
}

async function requireAuthSession(): Promise<{ userId: string }> {
  await ensureFreshAccessToken();
  const session = readStoredSessionSync();
  return { userId: session?.user?.id ?? "unknown" };
}

/**
 * Preserve status/errorCode across Electron IPC.
 * Electron only reliably clones Error.message, so encode as JSON.
 */
function rethrowGatewayError(err: unknown): never {
  if (err instanceof ExpertGatewayError) {
    throw encodeExpertIpcError({
      message: err.message,
      status: err.status,
      errorCode: err.errorCode,
    });
  }
  throw err;
}

function validateRequest(value: unknown): ExpertRequest {
  if (!isRecord(value)) throw new Error("Invalid ExpertRequest");
  if (value.kind !== "expert") throw new Error("Invalid ExpertRequest.kind");
  const requiredStrings = [
    "expertSlug",
    "skillName",
    "prompt",
    "sessionId",
    "profileId",
    "clientRequestId",
    "authGeneration",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      throw new Error(`Invalid ExpertRequest.${key}`);
    }
  }
  if (!Array.isArray(value.attachmentRefs)) {
    throw new Error("Invalid ExpertRequest.attachmentRefs");
  }
  return {
    kind: "expert",
    expertSlug: String(value.expertSlug).trim(),
    skillName: String(value.skillName).trim(),
    prompt: String(value.prompt),
    attachmentRefs: value.attachmentRefs.filter(
      (item): item is string => typeof item === "string",
    ),
    sessionId: String(value.sessionId).trim(),
    profileId: String(value.profileId).trim(),
    clientRequestId: String(value.clientRequestId).trim(),
    authGeneration: String(value.authGeneration).trim(),
  };
}

function assertAuthGeneration(request: ExpertRequest, userId: string): void {
  if (userId === "unknown") return;
  const expected = [`user:${userId}`, userId];
  if (!expected.includes(request.authGeneration)) {
    throw new Error("Auth generation mismatch");
  }
}

let unsubscribeProjection: (() => void) | null = null;
let forwarderGetMainWindow: (() => BrowserWindow | null) | null = null;

function attachProjectionForwarder(
  getMainWindow: () => BrowserWindow | null,
): void {
  forwarderGetMainWindow = getMainWindow;
  unsubscribeProjection?.();
  const service = getExpertRunService();
  unsubscribeProjection = service.onProjectionChanged((projection) => {
    // Materialize before notifying the renderer so sidebar sync / resume
    // already see state.db rows when the UI reacts to task_id/progress.
    try {
      materializeExpertSessionTranscript(projection);
    } catch (err) {
      console.warn("[expert] session materialize failed", err);
    }
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(EXPERT_IPC_CHANNELS.onProjectionChanged, projection);
    }
    const session = readStoredSessionSync();
    if (session?.user?.id) {
      try {
        upsertExpertContinuationProjection(
          projection,
          `user:${session.user.id}`,
        );
      } catch (err) {
        console.warn("[expert] continuation persist failed", err);
      }
    }
  });
}

/** Re-create run/gateway singletons and projection forwarder after logout/login. */
export function restoreExpertSubsystemAfterAuth(): void {
  if (!forwarderGetMainWindow) return;
  void getExpertRunService();
  void getExpertGatewayClient();
  attachProjectionForwarder(forwarderGetMainWindow);
}

export function registerExpertIpc(options: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  attachProjectionForwarder(options.getMainWindow);

  ipcMain.handle(EXPERT_IPC_CHANNELS.listCatalog, async (event) => {
    assertSender(event);
    await requireAuthSession();
    return getExpertGatewayClient().listCatalog();
  });

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.listSkills,
    async (event, expertSlug: unknown) => {
      assertSender(event);
      await requireAuthSession();
      if (typeof expertSlug !== "string" || !expertSlug.trim()) {
        throw new Error("expertSlug is required");
      }
      return getExpertGatewayClient().listSkills(expertSlug.trim());
    },
  );

  ipcMain.handle(EXPERT_IPC_CHANNELS.getHealth, async (event) => {
    assertSender(event);
    await requireAuthSession();
    try {
      return await getExpertGatewayClient().getHealth();
    } catch (err) {
      rethrowGatewayError(err);
    }
  });

  ipcMain.handle(EXPERT_IPC_CHANNELS.refreshCatalog, async (event) => {
    assertSender(event);
    await requireAuthSession();
    const client = getExpertGatewayClient();
    client.clearCache();
    return client.listCatalog();
  });

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.start,
    async (event, input: ExpertStartInput) => {
      assertSender(event);
      const auth = await requireAuthSession();
      const request = validateRequest(input?.request);
      assertAuthGeneration(request, auth.userId);
      return getExpertRunService().start(request);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.cancel,
    async (event, input: ExpertCancelInput) => {
      assertSender(event);
      await requireAuthSession();
      if (!input || typeof input.clientRequestId !== "string") {
        throw new Error("clientRequestId is required");
      }
      return getExpertRunService().cancel(
        input.clientRequestId,
        input.taskId ?? null,
      );
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.retry,
    async (event, input: ExpertRetryInput) => {
      assertSender(event);
      const auth = await requireAuthSession();
      if (!input || typeof input.previousClientRequestId !== "string") {
        throw new Error("previousClientRequestId is required");
      }
      const request = validateRequest(input.request);
      assertAuthGeneration(request, auth.userId);
      return getExpertRunService().retry(
        input.previousClientRequestId,
        request,
      );
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.getProjection,
    async (event, clientRequestId: unknown) => {
      assertSender(event);
      await requireAuthSession();
      if (typeof clientRequestId !== "string") return null;
      return getExpertRunService().getProjection(clientRequestId);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.listProjections,
    async (event, sessionId: unknown) => {
      assertSender(event);
      await requireAuthSession();
      if (typeof sessionId !== "string") return [];
      return getExpertRunService().listProjections(sessionId);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.rehydrateSession,
    async (event, sessionId: unknown) => {
      assertSender(event);
      await requireAuthSession();
      if (typeof sessionId !== "string" || !sessionId.trim()) return [];
      return rehydrateExpertContinuationsForSession(sessionId.trim());
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.retryArtifactDiscovery,
    async (event, input: ExpertRetryArtifactDiscoveryInput) => {
      assertSender(event);
      await requireAuthSession();
      if (
        !input ||
        typeof input.clientRequestId !== "string" ||
        !input.clientRequestId.trim()
      ) {
        throw new Error("clientRequestId is required");
      }
      return getExpertRunService().retryArtifactDiscovery(
        input.clientRequestId.trim(),
      );
    },
  );
}

/** Idempotent dispose used by logout and before-quit. */
export function disposeExpertSubsystem(): void {
  unsubscribeProjection?.();
  unsubscribeProjection = null;
  resetExpertRunServiceForTests();
  resetExpertGatewayClientForTests();
}
