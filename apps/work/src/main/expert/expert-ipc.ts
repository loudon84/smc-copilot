/**
 * Expert Main IPC registration — narrow DTO surface only.
 */

import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  EXPERT_IPC_CHANNELS,
  type ExpertCancelInput,
  type ExpertDownloadArtifactInput,
  type ExpertRequest,
  type ExpertRetryInput,
  type ExpertStartInput,
} from "../../shared/expert";
import {
  getCachedAccessToken,
  readStoredSessionSync,
} from "../auth/token-store";
import { downloadExpertArtifact, cleanupExpertArtifactTemps } from "./expert-artifact-download";
import {
  rehydrateExpertContinuationsForSession,
  upsertExpertContinuationProjection,
} from "./expert-continuation";
import {
  getExpertGatewayClient,
  resetExpertGatewayClientForTests,
} from "./expert-gateway-client";
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

function requireAuthSession(): { userId: string } {
  const token = getCachedAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const session = readStoredSessionSync();
  return { userId: session?.user?.id ?? "unknown" };
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
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(
        EXPERT_IPC_CHANNELS.onProjectionChanged,
        projection,
      );
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
    requireAuthSession();
    return getExpertGatewayClient().listCatalog();
  });

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.listSkills,
    async (event, expertSlug: unknown) => {
      assertSender(event);
      requireAuthSession();
      if (typeof expertSlug !== "string" || !expertSlug.trim()) {
        throw new Error("expertSlug is required");
      }
      return getExpertGatewayClient().listSkills(expertSlug.trim());
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.start,
    async (event, input: ExpertStartInput) => {
      assertSender(event);
      const auth = requireAuthSession();
      const request = validateRequest(input?.request);
      assertAuthGeneration(request, auth.userId);
      return getExpertRunService().start(request);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.cancel,
    async (event, input: ExpertCancelInput) => {
      assertSender(event);
      requireAuthSession();
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
      const auth = requireAuthSession();
      if (!input || typeof input.previousClientRequestId !== "string") {
        throw new Error("previousClientRequestId is required");
      }
      const request = validateRequest(input.request);
      assertAuthGeneration(request, auth.userId);
      return getExpertRunService().retry(input.previousClientRequestId, request);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.getProjection,
    async (event, clientRequestId: unknown) => {
      assertSender(event);
      requireAuthSession();
      if (typeof clientRequestId !== "string") return null;
      return getExpertRunService().getProjection(clientRequestId);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.listProjections,
    async (event, sessionId: unknown) => {
      assertSender(event);
      requireAuthSession();
      if (typeof sessionId !== "string") return [];
      return getExpertRunService().listProjections(sessionId);
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.rehydrateSession,
    async (event, sessionId: unknown) => {
      assertSender(event);
      requireAuthSession();
      if (typeof sessionId !== "string" || !sessionId.trim()) return [];
      return rehydrateExpertContinuationsForSession(sessionId.trim());
    },
  );

  ipcMain.handle(
    EXPERT_IPC_CHANNELS.downloadArtifact,
    async (event, input: ExpertDownloadArtifactInput) => {
      assertSender(event);
      requireAuthSession();
      if (
        !input ||
        typeof input.artifactId !== "string" ||
        typeof input.taskId !== "string"
      ) {
        throw new Error("taskId and artifactId are required");
      }
      if (typeof input.sessionId !== "string" || !input.sessionId.trim()) {
        throw new Error("sessionId is required");
      }
      if (isRecord(input) && ("downloadUrl" in input || "url" in input)) {
        throw new Error("Client-supplied artifact URLs are not allowed");
      }
      return downloadExpertArtifact({
        taskId: input.taskId,
        artifactId: input.artifactId,
        sessionId: input.sessionId,
        profileId: input.profileId,
      });
    },
  );
}

/** Idempotent dispose used by logout and before-quit. */
export function disposeExpertSubsystem(): void {
  unsubscribeProjection?.();
  unsubscribeProjection = null;
  cleanupExpertArtifactTemps();
  resetExpertRunServiceForTests();
  resetExpertGatewayClientForTests();
}
