import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { BrowserWindow } from "electron";
import { getDbConnection } from "../db";
import { profileHome } from "../utils";
import {
  REMOTE_EXPERT_IPC_CHANNELS,
} from "../../shared/remote-expert-acp/ipc";
import type { RemoteExpertSemanticEvent } from "../../shared/remote-expert-acp/events";
import type { RemoteExpertSubmitInput } from "../../shared/remote-expert-acp/events";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import { canonicalProfileJson, canonicalizeRemoteExpertProfile, profileDigest } from "./profile-digest";
import { verifyPinnedContract } from "./contract-lock";
import { evaluateRemoteExpertFeatureGate, isPackagedApp } from "./remote-expert-feature-gate";
import { resolveAcpBinary } from "./acp-binary-resolver";
import { assertAdapterCompatible, probeAdapterVersion } from "./compatibility-gate";
import { buildManagedCredentialEnv, overlayManagedEnv, assertArgvHasNoSecrets } from "./managed-credential-bridge";
import { ensureAcpProcess, getLiveAcpProcess, stopAcpProcess } from "./acp-process-manager";
import { AcpJsonRpcTransport } from "./acp-jsonrpc-transport";
import { AcpClient } from "./acp-client";
import { mapAcpSessionUpdate, mapResumeError, collectNodeskclawArtifactUris } from "./acp-event-mapper";
import { rememberPermissionRequest, peekPermissionRequest, markPermissionResolved } from "./permission-mapper";
import { buildPromptBlocks, prepareAttachmentResourceLinks } from "./remote-attachment-bridge";
import { parseArtifactResourceUri, upsertRemoteExpertAcpArtifact } from "./remote-artifact-bridge";
import { materializeRemoteExpertTurn } from "./remote-expert-session-materialize";
import {
  getRemoteExpertBinding,
  getRemoteExpertBindingBySessionId,
  insertRemoteExpertBinding,
  markRemoteExpertBindingState,
} from "./remote-expert-binding-store";
import {
  createSessionScope,
  getSessionMetadata,
  REMOTE_EXPERT_SESSION_CLASSIFICATION,
  upsertSessionMetadata,
} from "../session-metadata-store";
import { emitRemoteExpertDiagnostic, hashIdentity } from "./diagnostics";
import type { RemoteExpertPermissionOption } from "../../shared/remote-expert-acp/events";

interface SessionRuntime {
  sessionId: string;
  acpSessionId: string;
  client: AcpClient;
  transport: AcpJsonRpcTransport;
  profileDigest: string;
  profileId: string;
  activeTurnId?: string;
  assistantText: string;
  reasoningText: string;
  cwd: string;
}

const runtimes = new Map<string, SessionRuntime>();
const turning = new Map<string, string>();
const resumeInflight = new Map<string, Promise<void>>();

function emitToRenderer(sessionId: string, event: RemoteExpertSemanticEvent): void {
  const payload: RemoteExpertSemanticEvent = { ...event, sessionId };
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(REMOTE_EXPERT_IPC_CHANNELS.ON_EVENT, payload);
  }
}

function sessionCwd(sessionId: string): string {
  const digest = hashIdentity(sessionId);
  const dir = join(profileHome(), "remote-expert-acp", "sessions", digest);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeProfileFile(cwd: string, json: string): string {
  const path = join(cwd, "profile.json");
  writeFileSync(path, json, "utf8");
  return path;
}

async function bootClient(sessionKey: string, profileJson: string): Promise<{ client: AcpClient; transport: AcpJsonRpcTransport; cwd: string }> {
  const pin = verifyPinnedContract();
  const gate = evaluateRemoteExpertFeatureGate({ packed: isPackagedApp(), lock: pin.lock });
  if (!gate.enabled) {
    throw new RemoteExpertError(
      gate.errorCode || "REMOTE_EXPERT_PRODUCTION_GATE_BLOCKED",
      gate.reason || "remote expert disabled",
    );
  }
  const binary = resolveAcpBinary({ packed: isPackagedApp(), lock: pin.lock });
  const version = await probeAdapterVersion(binary.exePath);
  assertAdapterCompatible(version, pin.lock);
  const creds = await buildManagedCredentialEnv();
  const cwd = sessionCwd(sessionKey);
  const profilePath = writeProfileFile(cwd, profileJson);
  assertArgvHasNoSecrets(["serve", "--profile", profilePath]);
  const env = overlayManagedEnv(process.env, creds);
  const handle = await ensureAcpProcess({
    sessionKey,
    exePath: binary.exePath,
    profilePath,
    env,
  });
  let client!: AcpClient;
  const transport = new AcpJsonRpcTransport(
    (line) => handle.child.stdin.write(`${line}\n`),
    (method, params) => {
      if (method !== "session/update") return;
      const runtime = runtimes.get(sessionKey);
      if (!runtime?.activeTurnId) return;
      const mapped = mapAcpSessionUpdate({
        turnId: runtime.activeTurnId,
        sessionId: runtime.sessionId,
        params,
      });
      for (const event of mapped) {
        if (event.type === "assistant.delta") runtime.assistantText += event.text;
        if (event.type === "reasoning.delta") runtime.reasoningText += event.text;
        emitToRenderer(runtime.sessionId, event);
      }
      const uris = collectNodeskclawArtifactUris(params);
      for (const uri of uris) {
        try {
          parseArtifactResourceUri(uri);
          const upserted = upsertRemoteExpertAcpArtifact({
            profileId: runtime.profileId,
            sessionId: runtime.sessionId,
            uri,
          });
          emitRemoteExpertDiagnostic({
            name: "remote_expert.artifact_materialize",
            trace_id: runtime.activeTurnId,
            session_hash: hashIdentity(runtime.sessionId),
            turn_id: runtime.activeTurnId,
          });
          emitToRenderer(runtime.sessionId, {
            type: "artifact.ready",
            turnId: runtime.activeTurnId,
            managedFileId: upserted.fileId,
            name: upserted.name,
            uri: upserted.uri,
          });
        } catch {
          /* invalid artifact uri is ignored after parse failure */
        }
      }
    },
    (id, method, params) => {
      if (method !== "session/request_permission") return;
      const runtime = runtimes.get(sessionKey);
      const requestId = String(id);
      rememberPermissionRequest(requestId, id);
      emitToRenderer(runtime?.sessionId || sessionKey, {
        type: "permission.requested",
        sessionId: runtime?.sessionId,
        turnId: runtime?.activeTurnId || "",
        requestId,
        toolCallId: String(params.toolCallId ?? ""),
        toolName: String(params.toolName ?? ""),
        title: typeof params.title === "string" ? params.title : undefined,
        summary: typeof params.summary === "string" ? params.summary : undefined,
        options: ["allow_once", "reject_once"],
      });
    },
  );
  handle.stdout.on("data", (chunk: string) => transport.pushStdout(chunk));
  handle.stdout.on("exit", () => {
    transport.rejectAll(new RemoteExpertError("ACP_PROCESS_CRASHED", "adapter exited"));
  });
  client = new AcpClient(transport);
  await client.initialize();
  return { client, transport, cwd };
}

export async function submitRemoteExpertTurn(input: RemoteExpertSubmitInput): Promise<{ turnId: string; sessionId: string }> {
  const turnId = input.turnId?.trim() || randomUUID();
  const sessionId = input.sessionId?.trim() || randomUUID();
  if (turning.get(sessionId) && turning.get(sessionId) !== turnId) {
    throw new RemoteExpertError("REMOTE_TURN_CONFLICT", "active turn exists");
  }
  if (turning.get(sessionId) === turnId) {
    return { turnId, sessionId };
  }
  const profile = canonicalizeRemoteExpertProfile(input.profile);
  const digest = profileDigest(profile);
  const pin = verifyPinnedContract();
  emitRemoteExpertDiagnostic({
    name: "remote_expert.contract_gate",
    trace_id: turnId,
    session_hash: hashIdentity(sessionId),
  });
  const db = getDbConnection(false);
  if (!db) throw new RemoteExpertError("REMOTE_METADATA_MIGRATION_FAILED", "db unavailable");
  const identity = {
    sessionScope: input.sessionScope || createSessionScope(`local|${input.profileId || "default"}`),
    profileId: input.profileId || "default",
    sessionId,
  };
  const existingMeta = getSessionMetadata(db, identity);
  if (
    existingMeta &&
    existingMeta.executionProvider !== "remote-expert-acp"
  ) {
    throw new RemoteExpertError("REMOTE_PROFILE_IMMUTABLE", "cannot reclassify existing chat");
  }
  const existingBinding = getRemoteExpertBinding(db, identity);
  if (existingBinding && existingBinding.profileDigest !== digest) {
    throw new RemoteExpertError("REMOTE_PROFILE_IMMUTABLE", "durable profile frozen");
  }
  turning.set(sessionId, turnId);
  try {
    const links = await prepareAttachmentResourceLinks({
      profileId: identity.profileId,
      fileIds: input.fileIds ?? [],
    });
    emitRemoteExpertDiagnostic({
      name: "remote_expert.attachment_prepare",
      trace_id: turnId,
      session_hash: hashIdentity(sessionId),
      turn_id: turnId,
    });
    let runtime = runtimes.get(sessionId);
    if (!runtime) {
      const booted = await bootClient(sessionId, canonicalProfileJson(profile));
      emitRemoteExpertDiagnostic({
        name: "remote_expert.adapter_start",
        trace_id: turnId,
        session_hash: hashIdentity(sessionId),
      });
      let acpSessionId = existingBinding?.acpSessionId;
      if (!acpSessionId) {
        acpSessionId = await booted.client.sessionNew(booted.cwd);
        emitRemoteExpertDiagnostic({
          name: "remote_expert.session_new",
          trace_id: turnId,
          session_hash: hashIdentity(sessionId),
          acp_session_hash: hashIdentity(acpSessionId),
        });
        try {
          db.transaction(() => {
            upsertSessionMetadata(db, identity, REMOTE_EXPERT_SESSION_CLASSIFICATION, null);
            insertRemoteExpertBinding(db, {
              ...identity,
              acpSessionId: acpSessionId!,
              profile,
              lock: pin.lock,
            });
          })();
        } catch (err) {
          try {
            await booted.client.sessionClose(acpSessionId);
          } catch {
            emitRemoteExpertDiagnostic({
              name: "remote_expert.error",
              trace_id: turnId,
              session_hash: hashIdentity(sessionId),
              acp_session_hash: hashIdentity(acpSessionId),
              error_code: "ACP_CLOSE_FAILED",
            });
          }
          throw err;
        }
      }
      runtime = {
        sessionId,
        acpSessionId,
        client: booted.client,
        transport: booted.transport,
        profileDigest: digest,
        profileId: identity.profileId,
        assistantText: "",
        reasoningText: "",
        cwd: booted.cwd,
      };
      runtimes.set(sessionId, runtime);
    }
    runtime.activeTurnId = turnId;
    runtime.assistantText = "";
    runtime.reasoningText = "";
    emitRemoteExpertDiagnostic({
      name: "remote_expert.turn_start",
      trace_id: turnId,
      session_hash: hashIdentity(sessionId),
      acp_session_hash: hashIdentity(runtime.acpSessionId),
      turn_id: turnId,
    });
    try {
      await runtime.client.sessionPrompt(
        runtime.acpSessionId,
        buildPromptBlocks(input.text, links),
      );
      materializeRemoteExpertTurn({
        sessionId,
        profileId: identity.profileId,
        turnId,
        userContent: input.text,
        assistantContent: runtime.assistantText,
        reasoningContent: runtime.reasoningText || undefined,
      });
      emitRemoteExpertDiagnostic({
        name: "remote_expert.turn_end",
        trace_id: turnId,
        session_hash: hashIdentity(sessionId),
        acp_session_hash: hashIdentity(runtime.acpSessionId),
        turn_id: turnId,
      });
      emitToRenderer(sessionId, { type: "turn.end", turnId, outcome: "completed" });
    } catch (err) {
      emitToRenderer(sessionId, {
        type: "turn.end",
        turnId,
        outcome: "unknown",
        errorCode: "ACP_OUTCOME_UNKNOWN",
      });
      throw err;
    } finally {
      runtime.activeTurnId = undefined;
    }
    return { turnId, sessionId };
  } finally {
    turning.delete(sessionId);
  }
}

export async function resumeRemoteExpertSession(input: {
  sessionId: string;
  profileId: string;
  sessionScope: string;
}): Promise<void> {
  const existing = resumeInflight.get(input.sessionId);
  if (existing) return existing;
  const work = (async () => {
    const pin = verifyPinnedContract();
    void pin;
    const db = getDbConnection(false);
    if (!db) throw new RemoteExpertError("REMOTE_BINDING_NOT_FOUND", "db unavailable");
    const identity = {
      sessionScope: input.sessionScope || createSessionScope(`local|${input.profileId || "default"}`),
      profileId: input.profileId || "default",
      sessionId: input.sessionId,
    };
    const meta = getSessionMetadata(db, identity);
    if (meta?.executionProvider === "remote-expert-acp" && !getRemoteExpertBinding(db, identity)) {
      throw new RemoteExpertError("REMOTE_BINDING_NOT_FOUND", "binding missing");
    }
    const binding = getRemoteExpertBinding(db, identity) ?? getRemoteExpertBindingBySessionId(db, input.sessionId);
    if (!binding) throw new RemoteExpertError("REMOTE_BINDING_NOT_FOUND", "binding missing");
    const profile = canonicalizeRemoteExpertProfile({
      name: binding.profileName,
      agent_ref: binding.agentRef,
      knowledge_refs: binding.knowledgeRefs,
      connector_binding_refs: binding.connectorBindingRefs,
      integration_account_refs: binding.integrationAccountRefs,
    });
    if (profileDigest(profile) !== binding.profileDigest) {
      markRemoteExpertBindingState(db, identity, "resume_blocked");
      throw new RemoteExpertError("ACP_SESSION_PROFILE_MISMATCH", "profile digest mismatch");
    }
    try {
      const booted = await bootClient(input.sessionId, canonicalProfileJson(profile));
      await booted.client.sessionResume(booted.cwd, binding.acpSessionId);
      emitRemoteExpertDiagnostic({
        name: "remote_expert.session_resume",
        trace_id: hashIdentity(input.sessionId),
        session_hash: hashIdentity(input.sessionId),
        acp_session_hash: hashIdentity(binding.acpSessionId),
      });
      runtimes.set(input.sessionId, {
        sessionId: input.sessionId,
        acpSessionId: binding.acpSessionId,
        client: booted.client,
        transport: booted.transport,
        profileDigest: binding.profileDigest,
        profileId: identity.profileId,
        assistantText: "",
        reasoningText: "",
        cwd: booted.cwd,
      });
    } catch (err) {
      const kind = mapResumeError(err);
      if (kind === "temp") {
        throw new RemoteExpertError("ACP_SESSION_TEMPORARILY_UNAVAILABLE", "resume temporarily unavailable");
      }
      markRemoteExpertBindingState(db, identity, "resume_blocked");
      if (kind === "forbidden") throw new RemoteExpertError("ACP_SESSION_RESUME_FORBIDDEN", "resume forbidden");
      if (kind === "not_found") throw new RemoteExpertError("ACP_SESSION_NOT_FOUND", "session not found");
      throw new RemoteExpertError("ACP_SESSION_PROFILE_MISMATCH", "resume profile mismatch");
    }
  })();
  resumeInflight.set(input.sessionId, work);
  try {
    await work;
  } finally {
    resumeInflight.delete(input.sessionId);
  }
}

export function cancelRemoteExpertTurn(sessionId: string): void {
  const runtime = runtimes.get(sessionId);
  if (!runtime) return;
  runtime.client.sessionCancel(runtime.acpSessionId);
  emitRemoteExpertDiagnostic({
    name: "remote_expert.cancel",
    trace_id: hashIdentity(sessionId),
    session_hash: hashIdentity(sessionId),
    acp_session_hash: hashIdentity(runtime.acpSessionId),
  });
  const handle = getLiveAcpProcess(sessionId);
  setTimeout(() => {
    if (turning.has(sessionId) && handle) {
      handle.child.kill();
      emitToRenderer(sessionId, {
        type: "lifecycle",
        sessionId,
        state: "recovery_required",
        message: "ACP_CANCEL_GRACE_EXCEEDED",
      });
    }
  }, 5_000);
}

export async function closeRemoteExpertSession(sessionId: string): Promise<void> {
  const runtime = runtimes.get(sessionId);
  const db = getDbConnection(false);
  if (runtime) {
    try {
      await runtime.client.sessionClose(runtime.acpSessionId);
    } catch {
      emitRemoteExpertDiagnostic({
        name: "remote_expert.session_close",
        trace_id: hashIdentity(sessionId),
        session_hash: hashIdentity(sessionId),
        error_code: "ACP_CLOSE_FAILED",
      });
    }
  }
  await stopAcpProcess(sessionId);
  runtimes.delete(sessionId);
  if (db) {
    const binding = getRemoteExpertBindingBySessionId(db, sessionId);
    if (binding) {
      try {
        markRemoteExpertBindingState(
          db,
          {
            sessionScope: binding.sessionScope,
            profileId: binding.profileId,
            sessionId,
          },
          "closed",
        );
      } catch {
        /* ignore */
      }
    }
  }
}

export function decideRemoteExpertPermission(
  sessionId: string,
  requestId: string,
  optionId: RemoteExpertPermissionOption,
): void {
  const runtime = runtimes.get(sessionId);
  if (!runtime) {
    throw new RemoteExpertError("REMOTE_IPC_NOT_READY", "session not active");
  }
  const peeked = peekPermissionRequest(requestId);
  if (!peeked || peeked.resolved) {
    throw new RemoteExpertError(
      "ACP_PERMISSION_ALREADY_RESOLVED",
      "permission already resolved",
    );
  }
  try {
    runtime.client.respondPermission(peeked.rpcId, optionId);
  } catch {
    throw new RemoteExpertError(
      "ACP_PERMISSION_RESPONSE_FAILED",
      "permission response failed",
    );
  }
  markPermissionResolved(requestId, optionId);
  emitRemoteExpertDiagnostic({
    name: "remote_expert.permission_resolved",
    trace_id: runtime.activeTurnId || requestId,
    session_hash: hashIdentity(sessionId),
    turn_id: runtime.activeTurnId,
  });
  emitToRenderer(sessionId, {
    type: "permission.resolved",
    turnId: runtime.activeTurnId || "",
    requestId,
    optionId,
  });
}
