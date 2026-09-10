import { ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import {
  existsSync,
  readFileSync,
  appendFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import http from "http";
import https from "https";
import {
  HERMES_HOME,
  getEnhancedPath,
} from "./runtime/hermes-runtime-paths";
import {
  getApiServerKey,
  getConnectionConfig,
  getConfigValue,
  getModelConfig,
  readEnv,
} from "./config";
import {
  getSshTunnelUrl,
  isSshTunnelActive,
  isSshTunnelHealthy,
  ensureSshTunnel,
} from "./ssh-tunnel";
import {
  pidIsAliveAs,
  profileHome,
  profilePaths,
  normalizeProfileName,
  getActiveProfileNameSync,
} from "./utils";
import { getGatewayBaseUrl } from "./runtime/hermes-runtime-paths";
import { getProfilePort } from "./gateway-ports";
import { providerListSafe } from "./secrets";
import { type Attachment, escapeXmlAttr } from "../shared/attachments";
import { type SessionModelOverride } from "../shared/model-override";
import {
  chatToolEventFromPayload,
  chatToolProgressLabel,
  type ChatToolEvent,
} from "../shared/chat-stream";
import {
  chatToolEventFromRunEvent,
  parseRunSseBlock,
  runCompletedUsage,
  runEventReasoningText,
  supportsHermesRunsTransport,
  type HermesApiCapabilities,
} from "./run-stream";

/**
 * Resolve which profile a gateway call targets. An explicit profile always
 * wins; otherwise we fall back to the file-backed active profile so that
 * callers without a profile argument (health polling, status, app-exit)
 * operate on whatever the desktop is currently showing �?not a hardcoded
 * "default". Returns `undefined` for the default profile (matching the
 * profileHome/readEnv/getProfilePort convention).
 */
function resolveProfile(profile?: string): string | undefined {
  return normalizeProfileName(profile ?? getActiveProfileNameSync());
}

/** Map a resolved profile to the key used in the per-profile process maps. */
function profileKey(profile?: string): string {
  return resolveProfile(profile) ?? "default";
}

/**
 * Normalise a remote-mode URL the user typed into the connection
 * settings.  Strips trailing slashes and, importantly, a trailing
 * `/v1` segment �?callers append `/v1/<path>` themselves, so leaving
 * the user's `/v1` would produce `http://host/v1/v1/chat/completions`
 * �?404.  Reported as #266 (multiple users entered the URL "with
 * /v1" because the gateway's curl examples show that form).
 *
 * Also tolerates trailing whitespace and the rare `/v1/` (slash-suffixed)
 * form.  Returns the cleaned string.
 */
export function normaliseRemoteUrl(raw: string): string {
  let url = (raw || "").trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, "");
  // Strip trailing `/v1` (callers append /v1/<path> themselves)
  url = url.replace(/\/v1$/i, "");
  return url;
}

export function getApiUrl(_profile?: string): string {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    const sshUrl = getSshTunnelUrl();
    if (sshUrl) return normaliseRemoteUrl(sshUrl);
    throw new Error("SSH tunnel is not active");
  }
  if (conn.mode === "remote" && conn.remoteUrl) {
    return normaliseRemoteUrl(conn.remoteUrl);
  }
  return getGatewayBaseUrl();
}

export function isRemoteMode(): boolean {
  const mode = getConnectionConfig().mode;
  return mode === "remote" || mode === "ssh";
}

/** True only for pure remote HTTP �?SSH tunnel has full local access via SSH exec */
export function isRemoteOnlyMode(): boolean {
  return getConnectionConfig().mode === "remote";
}

// Cached API key read from the remote .env when SSH tunnel starts
let _sshRemoteApiKey = "";

export function setSshRemoteApiKey(key: string): void {
  _sshRemoteApiKey = key;
}

export function getRemoteAuthHeader(): Record<string, string> {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    if (_sshRemoteApiKey)
      return { Authorization: `Bearer ${_sshRemoteApiKey}` };
    return {};
  }
  if (
    conn.mode === "remote" &&
    conn.remoteAuthMode !== "oauth" &&
    conn.apiKey
  ) {
    return { Authorization: `Bearer ${conn.apiKey}` };
  }
  return {};
}

function getApiAuthHeaders(profile?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...getRemoteAuthHeader(),
  };
  // Local API server key (API_SERVER_KEY in the profile's .env /
  // config.yaml) only applies in local mode �?in remote/SSH mode the
  // remote endpoint's own auth header is authoritative.
  if (!isRemoteMode()) {
    const apiServerKey = getApiServerKey(profile);
    if (apiServerKey) {
      headers.Authorization = `Bearer ${apiServerKey}`;
    }
  }
  return headers;
}

function getJsonApiHeaders(
  profile: string | undefined,
  bodyBuf: Buffer,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Content-Length": String(bodyBuf.length),
    ...getApiAuthHeaders(profile),
  };
}

function capabilityCacheKey(profile?: string): string {
  const auth = getApiAuthHeaders(profile).Authorization ? "auth" : "anon";
  return `${getApiUrl(profile)}|${auth}`;
}

async function getApiCapabilities(
  profile?: string,
): Promise<HermesApiCapabilities | null> {
  let key: string;
  try {
    key = capabilityCacheKey(profile);
  } catch {
    return null;
  }
  const cached = capabilitiesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = `${getApiUrl(profile)}/v1/capabilities`;
  const requester = url.startsWith("https") ? https : http;
  const value = await new Promise<HermesApiCapabilities | null>((resolve) => {
    let done = false;
    let timeout: NodeJS.Timeout | null = null;
    const finish = (result: HermesApiCapabilities | null): void => {
      if (done) return;
      done = true;
      if (timeout) clearTimeout(timeout);
      resolve(result);
    };
    const req = requester.request(
      url,
      {
        method: "GET",
        headers: getApiAuthHeaders(profile),
        timeout: CAPABILITIES_TIMEOUT_MS,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            finish(null);
            return;
          }
          try {
            finish(JSON.parse(raw) as HermesApiCapabilities);
          } catch {
            finish(null);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      finish(null);
    });
    req.on("error", () => finish(null));
    timeout = setTimeout(() => {
      req.destroy();
      finish(null);
    }, CAPABILITIES_TIMEOUT_MS);
    req.end();
  });
  capabilitiesCache.set(key, {
    value,
    expiresAt: Date.now() + CAPABILITIES_CACHE_MS,
  });
  return value;
}

function resolveRemoteApiKey(url: string, apiKey?: string): string {
  if (apiKey !== undefined) return apiKey;

  const conn = getConnectionConfig();
  if (conn.mode !== "remote" || !conn.apiKey || !conn.remoteUrl) return "";
  if (normaliseRemoteUrl(conn.remoteUrl) !== normaliseRemoteUrl(url)) {
    return "";
  }
  if (conn.remoteAuthMode === "oauth") return "";
  return conn.apiKey;
}

export async function ensureSshTunnelIfNeeded(): Promise<void> {
  const conn = getConnectionConfig();
  if (
    conn.mode === "ssh" &&
    (!isSshTunnelActive() || !(await isSshTunnelHealthy()))
  ) {
    await ensureSshTunnel(conn.ssh);
  }
}

/**
 * Transcribe a recorded audio clip through the Hermes API server.
 *
 * The Python server owns STT provider selection (`stt.provider`, local
 * faster-whisper, Groq, OpenAI, ElevenLabs, etc.). Keeping desktop voice input
 * on `/api/audio/transcribe` matches upstream and avoids assuming that the
 * active chat model endpoint also exposes Whisper-compatible routes.
 *
 * Throws with a user-readable message so the caller can surface it.
 */
export async function transcribeAudio(
  audio: Uint8Array,
  mimeType: string,
  profile?: string,
): Promise<string> {
  const resolved = resolveProfile(profile);
  if (!isRemoteMode()) {
    const ready =
      apiServerAvailable === true || (await isApiServerReady(resolved));
    setApiCacheFor(resolved, ready);
    if (!ready) {
      throw new Error(
        "Voice input is unavailable: Hermes Gateway is not reachable.",
      );
    }
  }

  const safeMimeType = mimeType || "audio/webm";
  const body = {
    data_url: `data:${safeMimeType};base64,${Buffer.from(audio).toString(
      "base64",
    )}`,
    mime_type: safeMimeType,
  };
  const res = await fetch(`${getApiUrl(resolved)}/api/audio/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getApiAuthHeaders(resolved),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      !isRemoteMode() && res.status === 404
        ? "Speech-to-text is unavailable on this managed Hermes Gateway."
        : `Transcription failed (${res.status}). ${bodyText.slice(0, 200)}`.trim(),
    );
  }
  const data = (await res.json().catch(() => null)) as {
    transcript?: string;
    text?: string;
  } | null;
  if (!data) {
    throw new Error(
      "Transcription failed. The Hermes API returned an invalid response.",
    );
  }
  return (data.transcript || data.text || "").trim();
}

interface ChatHandle {
  abort: () => void;
}

export function tuiGatewayEnv(profile?: string): Record<string, string> {
  const resolved = resolveProfile(profile);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME: profileHome(resolved),
  };
  if (resolved) env.HERMES_PROFILE = resolved;
  for (const [key, value] of Object.entries(readEnv(profile))) {
    if (value) env[key] = value;
  }
  // Overlay provider-enumerated secrets BENEATH the values above (fill only
  // keys still absent), so a `command`-provider user gets the same resolved
  // key set here as on the CLI fallback path: process.env > .env > provider.
  for (const [key, value] of Object.entries(providerListSafe(profile))) {
    if (value && !env[key]) env[key] = value;
  }
  return env;
}

const CAPABILITIES_TIMEOUT_MS = 350;
const CAPABILITIES_CACHE_MS = 60_000;

const capabilitiesCache = new Map<
  string,
  { expiresAt: number; value: HermesApiCapabilities | null }
>();

// ────────────────────────────────────────────────────
//  API Server health check
// ────────────────────────────────────────────────────

function isApiServerReady(profile?: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = `${getApiUrl(profile)}/health`;
      const mod = url.startsWith("https") ? https : http;
      const req = mod.request(
        url,
        { method: "GET", timeout: 1500, headers: getRemoteAuthHeader() },
        (res) => {
          resolve(res.statusCode === 200);
          res.resume();
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function ensureApiServerConfig(profile?: string): void {
  try {
    const { configFile } = profilePaths(resolveProfile(profile));
    if (!existsSync(configFile)) return;
    const content = readFileSync(configFile, "utf-8");
    // If api_server is already configured, skip �?the port is then governed
    // by the existing block (reconciled for collisions by getProfilePort) and
    // by the API_SERVER_PORT env we pass at spawn.
    if (/api_server/i.test(content)) return;
    // Bind this profile's gateway to its own allocated port so profiles can
    // run concurrently without fighting over 8642.
    const port = getProfilePort(profile);
    const addition = `
# Desktop app API server (auto-configured)
platforms:
  api_server:
    enabled: true
    extra:
      port: ${port}
      host: "127.0.0.1"
`;
    appendFileSync(configFile, addition, "utf-8");
  } catch {
    /* non-fatal */
  }
}

// ────────────────────────────────────────────────────
//  HTTP API streaming (fast path �?no process spawn)
// ────────────────────────────────────────────────────

/**
 * Pull the streaming reasoning / thinking text from one SSE `delta`
 * object, if present. Two shapes seen in the wild:
 *
 *   - DeepSeek (reasoning models): `delta.reasoning_content`
 *   - OpenAI o1/o3-style streams + some OpenRouter routes:
 *     `delta.reasoning` (older OpenAI thinking-mode docs also use this
 *     field name).
 *
 * Returns `""` (falsy) for any other shape, so the caller can skip
 * forwarding without a null check.
 *
 * Exported so we can unit-test the field-extraction without booting
 * the whole HTTP path. (#352)
 */
export function extractReasoningDelta(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const d = delta as Record<string, unknown>;
  if (typeof d.reasoning_content === "string" && d.reasoning_content)
    return d.reasoning_content;
  if (typeof d.reasoning === "string" && d.reasoning) return d.reasoning;
  return "";
}

/**
 * Pending clarify requests, keyed by the gateway `request_id`. When the agent
 * asks a clarifying question the stream handler registers a resolver here (a
 * closure over the live gateway client) and surfaces the question to the
 * renderer. The renderer's answer arrives via the `clarify-respond` IPC handler,
 * which calls `resolvePendingClarify` to fire the resolver and forward the
 * answer to the gateway. Entries are one-shot and self-clear on use; the stream
 * handler also clears any leftover on turn end so an abandoned turn can't leak a
 * stale resolver.
 */
const pendingClarify = new Map<string, (answer: string) => void>();

export function registerPendingClarify(
  requestId: string,
  resolver: (answer: string) => void,
): void {
  pendingClarify.set(requestId, resolver);
}

/** Fire and remove the resolver for `requestId`. Returns true if one was waiting. */
export function resolvePendingClarify(
  requestId: string,
  answer: string,
): boolean {
  const resolver = pendingClarify.get(requestId);
  if (!resolver) return false;
  pendingClarify.delete(requestId);
  resolver(answer);
  return true;
}

export function clearPendingClarify(requestId: string): void {
  pendingClarify.delete(requestId);
}

export interface ChatCallbacks {
  onChunk: (text: string) => void;
  /** Streaming reasoning / thinking tokens, when the provider emits them
   *  alongside `content`. DeepSeek surfaces these as `delta.reasoning_content`;
   *  OpenAI o1/o3-style streams use `delta.reasoning`. Forwarded on a
   *  dedicated channel so the renderer can render the thinking bubble
   *  live instead of waiting for a state-DB refresh on focus change
   *  (issue #352). */
  onReasoningChunk?: (text: string) => void;
  onDone: (sessionId?: string) => void;
  onSessionStarted?: (sessionId: string) => void;
  onError: (error: string) => void;
  onToolProgress?: (tool: string) => void;
  onToolEvent?: (event: ChatToolEvent) => void;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  }) => void;
  /** The agent asked a clarifying question mid-turn (`clarify.request`). The
   *  renderer shows an inline card; the user's answer returns via the
   *  `clarify-respond` IPC handler, which resolves the pending request for this
   *  `requestId` by calling `clarify.respond` on the live gateway client. */
  onClarify?: (req: {
    requestId: string;
    question: string;
    choices: string[];
  }) => void;
}

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

/**
 * Build the OpenAI-compatible `content` payload for a user turn.
 *
 * - No attachments �?plain string (preserves prompt-cache friendliness for
 *   the all-text path).
 * - Text-file attachments �?inlined into the text part as `<file �?�?/file>`
 *   wrappers (the gateway rejects `file`/`input_file` content parts, see
 *   gateway/platforms/api_server.py:263).
 * - Image attachments �?emitted as `image_url` parts in the OpenAI vision
 *   format, which the gateway accepts and converts for Anthropic providers.
 * - Path-ref attachments �?appended as `[Attached file: <abs-path>]` lines
 *   so the agent's existing file-reading skills can pick them up.  Works
 *   for PDFs/docx/binaries the gateway won't pass through inline.
 */
export function buildUserContent(
  text: string,
  attachments?: Attachment[],
): ChatContent {
  if (!attachments || attachments.length === 0) return text;

  const textFiles = attachments.filter((a) => a.kind === "text-file");
  const pathRefs = attachments.filter(
    (a) => a.kind === "path-ref" && typeof a.path === "string" && a.path,
  );
  const images = attachments.filter(
    (a) => a.kind === "image" && typeof a.dataUrl === "string" && a.dataUrl,
  );

  const parts: string[] = [];
  if (text.trim()) parts.push(text);
  for (const f of textFiles) {
    if (typeof f.text !== "string") continue;
    const name = escapeXmlAttr(f.name);
    const mime = escapeXmlAttr(f.mime || "text/plain");
    parts.push(`<file name="${name}" mime="${mime}">\n${f.text}\n</file>`);
  }
  if (pathRefs.length > 0) {
    const lines = pathRefs.map((f) => `[Attached file: ${f.path}]`);
    parts.push(lines.join("\n"));
  }
  const composedText = parts.join("\n\n");

  if (images.length === 0) return composedText;

  const imageParts = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: img.dataUrl! },
  }));

  // Omit the text part entirely when there's nothing to say �?some
  // providers (Anthropic via Bedrock, certain vision endpoints) reject an
  // empty-string text part as `invalid_content_part`.
  if (!composedText) return imageParts;

  return [{ type: "text" as const, text: composedText }, ...imageParts];
}

/**
 * Build the system message that scopes a conversation to a working folder
 * (issue #27). Returns null when no folder is set (undefined / empty /
 * whitespace) so callers can skip injection. Exported for unit testing.
 */
export function contextFolderSystemMessage(
  contextFolder?: string,
): { role: "system"; content: string } | null {
  const folder = contextFolder?.trim();
  if (!folder) return null;
  return {
    role: "system",
    content:
      `The working folder for this conversation is ${folder}. ` +
      `When the user asks you to read, create, modify, or run project ` +
      `files, use the file, terminal, and code-execution tools with ` +
      `absolute paths under this folder.`,
  };
}

function reasoningEffortForProfile(
  profile?: string,
): "minimal" | "low" | "medium" | "high" | "xhigh" | null {
  const value = (getConfigValue("agent.reasoning_effort", profile) || "")
    .trim()
    .toLowerCase();

  return value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
    ? value
    : null;
}

function sendMessageViaApi(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  _resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  override?: SessionModelOverride,
): ChatHandle {
  const mc = effectiveModelConfig(profile, override);
  const controller = new AbortController();

  // Build full conversation from history + current message (standard OpenAI format).
  // History items are kept text-only �?attachments from prior turns live in
  // the gateway's session state when resuming via session_id.
  const messages: Array<{ role: string; content: ChatContent }> = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({
        role: msg.role === "agent" ? "assistant" : msg.role,
        content: msg.content,
      });
    }
  }
  const userContent = buildUserContent(message, attachments);
  messages.push({ role: "user", content: userContent });

  // Context folder (issue #27): when the conversation is bound to a working
  // folder, prepend a system message so the agent scopes file/terminal work
  // there. Injected only at the request-build step �?the renderer's visible
  // transcript stays clean, and getSessionMessages filters non-user/assistant
  // roles, so reloaded sessions stay clean too.
  const ctxSystem = contextFolderSystemMessage(contextFolder);
  if (ctxSystem) messages.unshift(ctxSystem);

  const reasoningEffort = reasoningEffortForProfile(profile);
  const bodyObj: Record<string, unknown> = {
    model: mc.model || "hermes-agent",
    messages,
    stream: true,
    ...(_resumeSessionId ? { session_id: _resumeSessionId } : {}),
  };
  if (reasoningEffort) bodyObj.reasoning_effort = reasoningEffort;
  const body = JSON.stringify(bodyObj);

  // Encode the body up-front into a Buffer so we can:
  //  1. Set `Content-Length` accurately based on byte length (NOT char
  //     count �?JSON.stringify of an image data URL is ASCII so they
  //     match, but multi-byte chars in user text would diverge).
  //  2. Disable Node's default `Transfer-Encoding: chunked` framing for
  //     bodies written via `req.write(body); req.end();`. Chunked
  //     framing skips the gateway's `body_limit_middleware` (which
  //     inspects Content-Length only), so an oversized payload that
  //     should produce a clean 413 "body_too_large" gets the
  //     misleading 400 "Invalid JSON in request body" via aiohttp's
  //     client_max_size overflow path. See #405.
  const bodyBuf = Buffer.from(body, "utf-8");

  const headers = getJsonApiHeaders(profile, bodyBuf);

  // Session id: always send via `X-Hermes-Session-Id` so the gateway
  // doesn't fall back to its `_derive_chat_session_id` fingerprint �?
  // sha256(system_prompt + first_user_message)[:16] �?which collides
  // across every chat whose first user message is the same (e.g. "Hi").
  // The collision silently fragments state.db rows across unrelated
  // conversations and, post-#352, surfaces as old-session content
  // bleeding into new chats when our end-of-stream merge reads
  // getSessionMessages(). Filed upstream as
  // NousResearch/hermes-agent#7484 (security framing �?same root cause).
  //
  // Format: `desk-<ms>-<uuidv4>`. UUIDv4 alone is collision-safe
  // probabilistically (~10⁻³⁶ for any pair); the timestamp prefix makes
  // it defensively unique even under a hypothetical PRNG bug, and the
  // `desk-` tag makes desktop-originated sessions visually distinct
  // from the gateway's fingerprint-derived `api-<hash>` ids in
  // state.db / logs.
  //
  // Gate on auth: the gateway rejects `X-Hermes-Session-Id` with 403
  // when API_SERVER_KEY isn't configured (its history-load is gated
  // behind auth). The desktop auto-generates API_SERVER_KEY at install
  // and remote mode supplies its own bearer, so in practice this
  // branch is always taken; the guard exists only so a misconfigured
  // local install degrades to the pre-fix (fingerprint) behaviour
  // rather than 403-looping.
  const hasAuth = "Authorization" in headers;
  const resumingExistingSession = Boolean(_resumeSessionId);
  let sessionId =
    _resumeSessionId || (hasAuth ? `desk-${Date.now()}-${randomUUID()}` : "");
  if (sessionId) {
    headers["X-Hermes-Session-Id"] = sessionId;
  }
  let announcedSessionId = "";
  function announceSessionId(id: string): void {
    if (!id || announcedSessionId === id) return;
    announcedSessionId = id;
    cb.onSessionStarted?.(id);
  }
  if (resumingExistingSession) {
    announceSessionId(sessionId);
  }

  let hasContent = false;
  let finished = false; // guard against double callbacks
  let lastError = ""; // capture embedded error messages
  // Tool progress pattern: `emoji tool_name` or `emoji description`
  const toolProgressRe = /^`([^\s`]+)\s+([^`]+)`$/;

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    console.log(
      "[hermes] finish called:",
      error ? `error=${error}` : "done",
      "sessionId=",
      sessionId,
    );
    if (error) {
      cb.onError(error);
    } else {
      cb.onDone(sessionId || undefined);
    }
  }

  function probeRealError(): void {
    // When streaming returns empty, make a non-streaming request to surface the real error
    const probeBodyObj: Record<string, unknown> = {
      model: mc.model || "hermes-agent",
      messages: [{ role: "user", content: userContent }],
      stream: false,
    };
    if (reasoningEffort) probeBodyObj.reasoning_effort = reasoningEffort;
    const probeBody = JSON.stringify(probeBodyObj);
    const probeBodyBuf = Buffer.from(probeBody, "utf-8");
    // Per-request Content-Length (the outer `headers` object's value
    // belongs to the streaming request �?reusing it here would lie about
    // this body's size and break the framing the same way the missing
    // Content-Length did before #405). Spread + override.
    const probeHeaders = {
      ...headers,
      "Content-Length": String(probeBodyBuf.length),
    };
    const probeUrl = `${getApiUrl(profile)}/v1/chat/completions`;
    const probeMod = probeUrl.startsWith("https") ? https : http;
    const probeReq = probeMod.request(
      probeUrl,
      { method: "POST", headers: probeHeaders },
      (res) => {
        let raw = "";
        res.on("data", (d) => {
          raw += d.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const content = parsed.choices?.[0]?.message?.content || "";
            const errMsg = parsed.error?.message || "";
            finish(
              content ||
                errMsg ||
                "No response received from the model. Check your model configuration and API key.",
            );
          } catch {
            finish(
              "No response received from the model. Check your model configuration and API key.",
            );
          }
        });
      },
    );
    probeReq.on("error", () => {
      finish(
        "No response received from the model. Check your model configuration and API key.",
      );
    });
    probeReq.write(probeBodyBuf);
    probeReq.end();
  }

  /** Handle a custom SSE event (non-data lines with `event:` prefix). */
  function processCustomEvent(eventType: string, data: string): void {
    if (eventType === "hermes.tool.progress") {
      try {
        const payload = JSON.parse(data) as Record<string, unknown>;
        const toolEvent = chatToolEventFromPayload(payload);
        announceSessionId(sessionId);
        if (cb.onToolEvent) {
          cb.onToolEvent(toolEvent);
        }
        if (!cb.onToolEvent && cb.onToolProgress) {
          cb.onToolProgress(chatToolProgressLabel(toolEvent));
        }
      } catch {
        /* malformed �?skip */
      }
    }
  }

  function processSseData(data: string): boolean {
    if (data === "[DONE]") {
      if (hasContent) {
        finish();
      } else if (lastError) {
        finish(lastError);
      } else {
        // Streaming returned empty �?probe non-streaming to get the real error
        probeRealError();
      }
      return true; // signals done
    }
    try {
      const parsed = JSON.parse(data);

      // Capture error responses forwarded through SSE
      if (parsed.error) {
        lastError = parsed.error.message || JSON.stringify(parsed.error);
        return false;
      }

      const choice = parsed.choices?.[0];
      const delta = choice?.delta;

      // Extract usage from final chunk (with optional cost + rate limit info)
      if (parsed.usage && cb.onUsage) {
        cb.onUsage({
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0,
          cost: parsed.usage.cost,
          rateLimitRemaining: parsed.usage.rate_limit_remaining,
          rateLimitReset: parsed.usage.rate_limit_reset,
          // Prompt-cache stats for the context gauge. The gateway emits
          // cache_read_tokens / cache_write_tokens; OpenAI-style providers
          // expose cached_tokens under prompt_tokens_details.
          cacheReadTokens:
            parsed.usage.cache_read_tokens ??
            parsed.usage.prompt_tokens_details?.cached_tokens,
          cacheWriteTokens: parsed.usage.cache_write_tokens,
        });
      }

      // Reasoning / thinking tokens, when the provider emits them.
      // Forwarded on a dedicated callback so the renderer can render the
      // thinking bubble live (#352). We do NOT set `hasContent = true`
      // here �?reasoning alone shouldn't suppress the "empty stream"
      // diagnostic probe.
      const reasoningDelta = extractReasoningDelta(delta);
      if (reasoningDelta && cb.onReasoningChunk) {
        announceSessionId(sessionId);
        cb.onReasoningChunk(reasoningDelta);
      }

      if (delta?.content) {
        const content = delta.content.trim();
        // Legacy: Detect tool progress lines injected into content: `🔍 search_web`
        const match = toolProgressRe.exec(content);
        if (match && cb.onToolProgress) {
          cb.onToolProgress(`${match[1]} ${match[2]}`);
        } else {
          hasContent = true;
          announceSessionId(sessionId);
          cb.onChunk(delta.content);
        }
      }
    } catch {
      /* malformed chunk �?skip */
    }
    return false;
  }

  const chatUrl = `${getApiUrl(profile)}/v1/chat/completions`;
  const requester = chatUrl.startsWith("https") ? https.request : http.request;
  const req = requester(
    chatUrl,
    {
      method: "POST",
      headers,
      signal: controller.signal,
      timeout: 120000,
    },
    (res) => {
      const sid = res.headers["x-hermes-session-id"];
      if (sid && typeof sid === "string") {
        sessionId = sid;
        announceSessionId(sessionId);
      }

      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d) => {
          errBody += d.toString();
        });
        res.on("end", () => {
          try {
            const err = JSON.parse(errBody);
            finish(err.error?.message || `API error ${res.statusCode}`);
          } catch {
            finish(
              `API server returned ${res.statusCode}: ${errBody.slice(0, 200)}`,
            );
          }
        });
        return;
      }

      let buffer = "";

      /** Parse an SSE block which may contain `event:` and `data:` lines. */
      function processSseBlock(block: string): boolean {
        let eventType = "";
        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataLine = line.slice(6);
          }
        }
        if (!dataLine) return false;
        if (eventType) {
          // Custom event (e.g. hermes.tool.progress) �?never signals [DONE]
          processCustomEvent(eventType, dataLine);
          return false;
        }
        return processSseData(dataLine);
      }

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (processSseBlock(part)) return;
        }
      });

      res.on("end", () => {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            if (processSseBlock(part)) return;
          }
        }
        // Signal completion �?even when no content was received
        if (!hasContent && !lastError) {
          probeRealError();
          return;
        }
        finish(hasContent ? undefined : lastError);
      });

      res.on("error", (err) => {
        if (err.message === "aborted" || err.name === "AbortError") return;
        finish(`Stream error: ${err.message}`);
      });
    },
  );

  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`API request failed: ${err.message}`);
  });
  req.on("timeout", () => {
    finish(
      "API request timed out. Check the SSH tunnel and remote Hermes gateway.",
    );
    req.destroy();
  });

  req.write(bodyBuf);
  req.end();

  return {
    abort: () => {
      controller.abort();
    },
  };
}

function apiHistory(
  history?: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  if (!history || history.length === 0) return [];
  return history.map((msg) => ({
    role:
      msg.role === "agent"
        ? "assistant"
        : msg.role === "assistant"
          ? "assistant"
          : "user",
    content: msg.content,
  }));
}

function postRunStop(
  apiUrl: string,
  profile: string | undefined,
  runId: string,
): void {
  const url = `${apiUrl}/v1/runs/${encodeURIComponent(runId)}/stop`;
  const requester = url.startsWith("https") ? https : http;
  const req = requester.request(url, {
    method: "POST",
    headers: getApiAuthHeaders(profile),
    timeout: 3000,
  });
  req.on("error", () => undefined);
  req.on("timeout", () => req.destroy());
  req.end();
}

function sendMessageViaRuns(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  override?: SessionModelOverride,
): ChatHandle {
  const mc = effectiveModelConfig(profile, override);
  const controller = new AbortController();
  const apiUrl = getApiUrl(profile);
  const headersForAuth = getApiAuthHeaders(profile);
  const sessionId =
    resumeSessionId ||
    (headersForAuth.Authorization ? `desk-${Date.now()}-${randomUUID()}` : "");
  const ctxSystem = contextFolderSystemMessage(contextFolder);
  const bodyObj: Record<string, unknown> = {
    model: mc.model || "hermes-agent",
    input: message,
    conversation_history: apiHistory(history),
  };
  const reasoningEffort = reasoningEffortForProfile(profile);
  if (reasoningEffort) bodyObj.reasoning_effort = reasoningEffort;
  if (sessionId) bodyObj.session_id = sessionId;
  if (ctxSystem) bodyObj.instructions = ctxSystem.content;
  const bodyBuf = Buffer.from(JSON.stringify(bodyObj), "utf-8");
  const headers = getJsonApiHeaders(profile, bodyBuf);
  if (sessionId) {
    headers["X-Hermes-Session-Id"] = sessionId;
  }
  const resumingExistingSession = Boolean(resumeSessionId);
  let announcedSessionId = "";
  function announceSessionId(id: string): void {
    if (!id || announcedSessionId === id) return;
    announcedSessionId = id;
    cb.onSessionStarted?.(id);
  }
  if (resumingExistingSession) {
    announceSessionId(sessionId);
  }

  let runId = "";
  let hasContent = false;
  let finished = false;
  let fallbackStarted = false;
  let startReq: http.ClientRequest | null = null;
  let eventsReq: http.ClientRequest | null = null;
  let fallbackHandle: ChatHandle | null = null;

  function finish(error?: string): void {
    if (finished || fallbackStarted) return;
    finished = true;
    if (error) {
      cb.onError(error);
    } else {
      cb.onDone(sessionId || undefined);
    }
  }

  function fallbackToChatCompletions(): void {
    if (finished || fallbackStarted) return;
    fallbackStarted = true;
    fallbackHandle = sendMessageViaApi(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      attachments,
      contextFolder,
      override,
    );
  }

  function stopRunAndFallback(): void {
    if (finished || fallbackStarted) return;
    if (runId) postRunStop(apiUrl, profile, runId);
    eventsReq?.destroy();
    fallbackToChatCompletions();
  }

  function handleRunEvent(raw: Record<string, unknown>): void {
    const eventName = typeof raw.event === "string" ? raw.event : "";
    if (eventName === "message.delta") {
      const delta = typeof raw.delta === "string" ? raw.delta : "";
      if (delta) {
        hasContent = true;
        announceSessionId(sessionId);
        cb.onChunk(delta);
      }
      return;
    }

    const reasoning = runEventReasoningText(raw);
    if (reasoning && cb.onReasoningChunk) {
      announceSessionId(sessionId);
      cb.onReasoningChunk(reasoning);
      return;
    }

    const toolEvent = chatToolEventFromRunEvent(raw);
    if (toolEvent) {
      announceSessionId(sessionId);
      if (cb.onToolEvent) {
        cb.onToolEvent(toolEvent);
      } else if (cb.onToolProgress) {
        cb.onToolProgress(chatToolProgressLabel(toolEvent));
      }
      return;
    }

    if (eventName === "run.completed") {
      const output = typeof raw.output === "string" ? raw.output : "";
      if (output && !hasContent) {
        hasContent = true;
        announceSessionId(sessionId);
        cb.onChunk(output);
      }
      const usage = runCompletedUsage(raw);
      if (usage && cb.onUsage) cb.onUsage(usage);
      finish();
      return;
    }

    if (eventName === "run.failed") {
      const err =
        typeof raw.error === "string" && raw.error
          ? raw.error
          : "Hermes run failed.";
      if (!hasContent) {
        fallbackToChatCompletions();
        return;
      }
      finish(err);
      return;
    }

    if (eventName === "run.cancelled") {
      finish(hasContent ? undefined : "Hermes run was cancelled.");
      return;
    }

    if (eventName === "approval.request") {
      // The current renderer's approval controls are wired to the legacy chat
      // flow and only appear after a response finishes. A run pauses before it
      // can finish, so fall back to the existing path instead of deadlocking
      // the user on a hidden approval request.
      stopRunAndFallback();
    }
  }

  function openEventStream(nextRunId: string): void {
    const eventsUrl = `${apiUrl}/v1/runs/${encodeURIComponent(nextRunId)}/events`;
    const requester = eventsUrl.startsWith("https") ? https : http;
    eventsReq = requester.request(
      eventsUrl,
      {
        method: "GET",
        headers: getApiAuthHeaders(profile),
        signal: controller.signal,
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          stopRunAndFallback();
          return;
        }
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const parsed = parseRunSseBlock(part);
            if (!parsed || !parsed.data || parsed.data.startsWith(":")) {
              continue;
            }
            try {
              handleRunEvent(
                JSON.parse(parsed.data) as Record<string, unknown>,
              );
            } catch {
              /* malformed run event �?skip */
            }
          }
        });
        res.on("end", () => {
          if (buffer.trim()) {
            const parsed = parseRunSseBlock(buffer);
            if (parsed?.data) {
              try {
                handleRunEvent(
                  JSON.parse(parsed.data) as Record<string, unknown>,
                );
              } catch {
                /* malformed run event �?skip */
              }
            }
          }
          if (!finished) finish();
        });
      },
    );
    eventsReq.on("error", (err) => {
      if (err.name === "AbortError" || finished) return;
      if (!hasContent) {
        stopRunAndFallback();
        return;
      }
      finish(`Run event stream failed: ${err.message}`);
    });
    eventsReq.on("timeout", () => {
      eventsReq?.destroy();
      if (!hasContent) {
        stopRunAndFallback();
        return;
      }
      finish("Run event stream timed out.");
    });
    eventsReq.end();
  }

  const startUrl = `${apiUrl}/v1/runs`;
  const requester = startUrl.startsWith("https") ? https : http;
  startReq = requester.request(
    startUrl,
    {
      method: "POST",
      headers,
      signal: controller.signal,
      timeout: 30000,
    },
    (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk.toString();
      });
      res.on("end", () => {
        if (res.statusCode !== 202 && res.statusCode !== 200) {
          fallbackToChatCompletions();
          return;
        }
        try {
          const parsed = JSON.parse(raw) as { run_id?: unknown };
          runId = typeof parsed.run_id === "string" ? parsed.run_id : "";
        } catch {
          runId = "";
        }
        if (!runId) {
          fallbackToChatCompletions();
          return;
        }
        openEventStream(runId);
      });
    },
  );
  startReq.on("error", (err) => {
    if (err.name === "AbortError" || finished) return;
    fallbackToChatCompletions();
  });
  startReq.on("timeout", () => {
    startReq?.destroy();
    fallbackToChatCompletions();
  });
  startReq.write(bodyBuf);
  startReq.end();

  return {
    abort: () => {
      if (finished && !fallbackStarted) return;
      controller.abort();
      startReq?.destroy();
      eventsReq?.destroy();
      fallbackHandle?.abort();
      if (runId) postRunStop(apiUrl, profile, runId);
    },
  };
}

// ────────────────────────────────────────────────────
//  Session model overlay (Gateway transport only)
// ────────────────────────────────────────────────────

type ModelConfig = ReturnType<typeof getModelConfig>;

/**
 * Overlay a session-scoped model override on top of the persisted config.yaml
 * model config. Non-empty override fields win; empty/absent fields fall back to
 * the persisted value. The result drives request routing for a single turn
 * without ever touching config.yaml (the global default is preserved �?#688).
 */
function effectiveModelConfig(
  profile: string | undefined,
  override?: SessionModelOverride,
): ModelConfig {
  const mc = getModelConfig(profile);
  if (!override) return mc;
  return {
    provider: override.provider || mc.provider,
    model: override.model || mc.model,
    // baseUrl is intentionally taken verbatim from the override (including an
    // empty string) so a switch to a built-in provider clears a stale custom
    // URL; only fall back to the persisted value when the override omits it.
    baseUrl: override.baseUrl !== undefined ? override.baseUrl : mc.baseUrl,
  };
}

/**
 * Local chat has no Python CLI fallback. Session overrides stay on the
 * Gateway HTTP/SSE path, including attachment turns.
 */
export function shouldForceCliForSessionOverride(
  _persisted: ModelConfig,
  _effective: ModelConfig,
  _override: SessionModelOverride | undefined,
  _attachments?: Attachment[],
): boolean {
  return false;
}

// ────────────────────────────────────────────────────
//  Public API: Gateway HTTP/SSE only
// ────────────────────────────────────────────────────

let apiServerAvailable: boolean | null = null; // cached after first check

function setApiCacheFor(
  profile: string | undefined,
  value: boolean | null,
): void {
  if (profileKey(profile) === profileKey(undefined)) {
    apiServerAvailable = value;
  }
}

function isLocalApiTransportError(error: string): boolean {
  return /^API request failed:.*(?:\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE)\b|socket hang up)/i.test(
    error,
  );
}

async function sendMessageViaNonGatewayApi(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  override?: SessionModelOverride,
): Promise<ChatHandle> {
  const approvalCommand = /^\/(?:approve|deny)\b/i.test(message.trim());
  if (!attachments?.length && !approvalCommand) {
    const capabilities = await getApiCapabilities(profile);
    if (supportsHermesRunsTransport(capabilities)) {
      return sendMessageViaRuns(
        message,
        cb,
        profile,
        resumeSessionId,
        history,
        attachments,
        contextFolder,
        override,
      );
    }
  }

  return sendMessageViaApi(
    message,
    cb,
    profile,
    resumeSessionId,
    history,
    attachments,
    contextFolder,
    override,
  );
}

async function sendMessageViaBestApi(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  override?: SessionModelOverride,
): Promise<ChatHandle> {
  return sendMessageViaNonGatewayApi(
    message,
    cb,
    profile,
    resumeSessionId,
    history,
    attachments,
    contextFolder,
    override,
  );
}

async function sendMessageViaBestApiWithLocalRecovery(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  override?: SessionModelOverride,
): Promise<ChatHandle> {
  let aborted = false;
  let retrying = false;
  let sawOutput = false;
  let settled = false;
  let activeHandle: ChatHandle | null = null;

  const recoverAfterPartialOutput = (error: string): void => {
    if (aborted || retrying || settled) return;

    retrying = true;
    activeHandle?.abort();
    setApiCacheFor(profile, false);
    settled = true;
    cb.onError(error);

    void isApiServerReady(profile)
      .then((recovered) => {
        setApiCacheFor(profile, recovered);
      })
      .catch(() => {
        setApiCacheFor(profile, false);
      });
  };

  const recoverAndRetry = async (): Promise<void> => {
    if (aborted || retrying || settled) return;

    retrying = true;
    activeHandle?.abort();
    setApiCacheFor(profile, false);
    const recovered = await isApiServerReady(profile);
    if (aborted) return;

    if (recovered) {
      setApiCacheFor(profile, true);
      activeHandle = await sendMessageViaBestApi(
        message,
        cb,
        profile,
        resumeSessionId,
        history,
        attachments,
        contextFolder,
        override,
      );
      return;
    }

    settled = true;
    cb.onError("Hermes Gateway is unreachable.");
  };

  const recoverAndFail = async (error: string): Promise<void> => {
    if (aborted || retrying || settled) return;

    retrying = true;
    activeHandle?.abort();
    setApiCacheFor(profile, false);
    const recovered = await isApiServerReady(profile);
    if (aborted) return;

    setApiCacheFor(profile, recovered);
    settled = true;
    cb.onError(error);
  };

  const handle: ChatHandle = {
    abort: () => {
      aborted = true;
      activeHandle?.abort();
    },
  };

  const callbacks: ChatCallbacks = {
    ...cb,
    onChunk: (text) => {
      sawOutput = true;
      cb.onChunk(text);
    },
    onReasoningChunk: cb.onReasoningChunk
      ? (text) => {
          sawOutput = true;
          cb.onReasoningChunk?.(text);
        }
      : undefined,
    onToolProgress: cb.onToolProgress
      ? (tool) => {
          sawOutput = true;
          cb.onToolProgress?.(tool);
        }
      : undefined,
    onToolEvent: cb.onToolEvent
      ? (event) => {
          sawOutput = true;
          cb.onToolEvent?.(event);
        }
      : undefined,
    onUsage: cb.onUsage,
    onSessionStarted: cb.onSessionStarted,
    onDone: (sessionId) => {
      settled = true;
      cb.onDone(sessionId);
    },
    onError: (error) => {
      if (sawOutput) {
        recoverAfterPartialOutput(error);
        return;
      }

      if (isLocalApiTransportError(error)) {
        void recoverAndRetry();
        return;
      }

      void recoverAndFail(error);
    },
  };

  activeHandle = await sendMessageViaBestApi(
    message,
    callbacks,
    profile,
    resumeSessionId,
    history,
    attachments,
    contextFolder,
    override,
  );

  return handle;
}

export async function sendMessage(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  attachments?: Attachment[],
  contextFolder?: string,
  override?: SessionModelOverride,
): Promise<ChatHandle> {
  ensureInitialized();

  if (isRemoteMode()) {
    return sendMessageViaBestApi(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      attachments,
      contextFolder,
      override,
    );
  }

  if (apiServerAvailable === null || apiServerAvailable === false) {
    apiServerAvailable = await isApiServerReady(profile);
  }

  if (apiServerAvailable) {
    return sendMessageViaBestApiWithLocalRecovery(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      attachments,
      contextFolder,
      override,
    );
  }

  cb.onError("Hermes gateway is unavailable.");
  return { abort: () => {} };
}

// Lazy init �?called on first sendMessage or gateway start
let _initialized = false;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

function ensureInitialized(): void {
  if (_initialized) return;
  _initialized = true;
  // Note: api_server config is written per-profile by startGateway() now
  // (each profile needs its own port), so ensureInitialized only owns the
  // shared health poller.
  startHealthPolling();
}

function startHealthPolling(): void {
  if (_healthCheckInterval) return;
  _healthCheckInterval = setInterval(async () => {
    apiServerAvailable = await isApiServerReady();
    // Stop polling once API is confirmed available �?only re-check on demand
    if (apiServerAvailable && _healthCheckInterval) {
      clearInterval(_healthCheckInterval);
      _healthCheckInterval = null;
    }
  }, 15000);
}

export function stopHealthPolling(): void {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
  }
}

// ────────────────────────────────────────────────────
//  Gateway management
// ────────────────────────────────────────────────────

// Profiles each own a gateway, keyed by profileKey() ("default" for the
// default profile, the profile name otherwise). Tracking them in maps �?
// rather than a single global �?lets several profiles' gateways run at once
// (e.g. each keeping its own Telegram bot online), which is the documented
// hermes model: one gateway per profile, bound to that profile's own port.
const gatewayProcesses = new Map<string, ChildProcess>();

export interface GatewayStartResult {
  success: boolean;
  running: boolean;
  alreadyRunning?: boolean;
  error?: string;
  logPath?: string;
}

export function buildGatewayEnv(profile?: string): Record<string, string> {
  // Make sure this profile's config.yaml enables the api_server and binds the
  // profile's own port before we spawn.
  ensureApiServerConfig(profile);
  const port = getProfilePort(profile);

  const gatewayEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME: HERMES_HOME,
    API_SERVER_ENABLED: "true",
    // Bind to this profile's port. config.yaml's api_server.port wins when
    // present (getProfilePort keeps it collision-free); this env value covers
    // the case where the block exists but omits an explicit port.
    API_SERVER_PORT: String(port),
  };

  // Inject ALL profile API keys so the gateway can authenticate with any provider.
  const profileEnv = readEnv(profile);
  for (const [k, value] of Object.entries(profileEnv)) {
    if (value) {
      gatewayEnv[k] = value;
    }
  }

  // Overlay provider-enumerated secrets BENEATH the values above (fill only
  // keys still absent), so a `command`-provider user gets the same resolved
  // key set on the gateway env path: process.env > .env > provider.
  for (const [k, value] of Object.entries(providerListSafe(profile))) {
    if (value && !gatewayEnv[k]) {
      gatewayEnv[k] = value;
    }
  }

  // Inject the resolved API_SERVER_KEY into the gateway's env.
  //
  // The desktop's `getApiServerKey` reads the shared secret from six
  // sources: config.yaml top-level `API_SERVER_KEY:`, `.env`
  // `API_SERVER_KEY=`, and config.yaml `api_server.token:` (each per-profile
  // and default-profile). The upstream gateway's `APIServerAdapter` (see
  // `gateway/platforms/api_server.py:647`) only reads two of those:
  // `api_server.extra.key` from config.yaml, or `os.getenv("API_SERVER_KEY")`
  // at startup. Upstream `gateway/run.py:608-610` bridges *top-level*
  // config.yaml keys into env vars, so `API_SERVER_KEY:` at the top
  // level works �?but the nested `api_server.token:` location does not
  // become an env var, and the gateway never reads it directly.
  //
  // The result is a divergence: the desktop happily sends
  // `Authorization: Bearer <key>` + `X-Hermes-Session-Id` for users
  // whose key lives in `api_server.token`, while the gateway's
  // `self._api_key` is empty and returns 403 with
  //   "Session continuation requires API key authentication.
  //    Configure API_SERVER_KEY to enable this feature."
  // (api_server.py:1097-1109). This is what users on Telegram, Reddit,
  // and several open issues have been hitting since v0.5.1 �?PR #357
  // started sending the session header on every fresh chat, which made
  // the latent divergence user-visible on every send.
  //
  // Bridging the desktop's resolved value into the spawn env makes the
  // gateway's `os.getenv("API_SERVER_KEY")` fallback see whatever the
  // desktop sees, regardless of source. This is the canonical fix until
  // upstream learns to read `api_server.token` directly.
  const resolvedApiServerKey = getApiServerKey(profile);
  if (resolvedApiServerKey) {
    gatewayEnv.API_SERVER_KEY = resolvedApiServerKey;
  }

  return gatewayEnv;
}

export function startGatewayDetailed(profile?: string): GatewayStartResult {
  void profile;
  console.warn('[gateway] startGateway() refused — Work is not the Gateway process owner');
  return {
    success: false,
    running: false,
    error: 'Hermes Gateway is managed by the endpoint management service.',
  };
}

export function startGateway(profile?: string): boolean {
  const result = startGatewayDetailed(profile);
  return result.success && !result.alreadyRunning;
}

function parsePidFromFile(pidFile: string): number | null {
  if (!existsSync(pidFile)) return null;
  try {
    const raw = readFileSync(pidFile, "utf-8").trim();
    // PID file can be JSON ({"pid": 1234, ...}) or plain integer
    const parsed = raw.startsWith("{")
      ? JSON.parse(raw).pid
      : parseInt(raw, 10);
    return typeof parsed === "number" && !isNaN(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The gateway.pid path for a profile. The hermes CLI writes it into the
 * profile's home directory (~/.hermes/gateway.pid for default,
 * ~/.hermes/profiles/<name>/gateway.pid for a named profile), so each
 * profile's gateway has its own PID file �?that's what lets them coexist.
 */
function gatewayPidPath(profile?: string): string {
  return join(profileHome(resolveProfile(profile)), "gateway.pid");
}

function readPidFile(profile?: string): number | null {
  return readPidFileEntry(profile)?.pid ?? null;
}

function readPidFileEntry(
  profile?: string,
): { path: string; pid: number } | null {
  const pidFile = gatewayPidPath(profile);
  const pid = parsePidFromFile(pidFile);
  return pid === null ? null : { path: pidFile, pid };
}

/**
 * Stop a single profile's gateway. Defaults to the active profile. By design
 * this only touches the named profile �?switching profiles, app exit, etc.
 * must never take down a *different* profile's gateway (and its bots).
 */
export function stopGateway(
  profileOrForce?: string | boolean,
  force = false,
): void {
  void profileOrForce;
  void force;
}

function isChildProcessAlive(proc: ChildProcess): boolean {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return false;
  }
  if (typeof proc.pid !== "number") return !proc.killed;
  try {
    process.kill(proc.pid, 0);
    return true;
  } catch {
    return false;
  }
}

const GATEWAY_IMAGE_PREFIXES = ["hermes"];

export function isGatewayRunning(profile?: string): boolean {
  const proc = gatewayProcesses.get(profileKey(profile));
  if (proc && isChildProcessAlive(proc)) return true;
  const pid = readPidFile(profile);
  if (!pid) return false;
  return pidIsAliveAs(pid, GATEWAY_IMAGE_PREFIXES);
}

export function isApiReady(): boolean {
  return apiServerAvailable === true;
}

export function isGatewayHealthy(profile?: string): Promise<boolean> {
  return isApiServerReady(profile);
}

export function testRemoteConnection(
  url: string,
  apiKey?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = getConnectionConfig();
    const configuredOAuth =
      apiKey === undefined &&
      conn.mode === "remote" &&
      conn.remoteAuthMode === "oauth" &&
      normaliseRemoteUrl(conn.remoteUrl) === normaliseRemoteUrl(url);
    const target = `${normaliseRemoteUrl(url)}${
      configuredOAuth ? "/api/status" : "/health"
    }`;
    const mod = target.startsWith("https") ? https : http;
    const headers: Record<string, string> = {};
    const resolvedApiKey = resolveRemoteApiKey(url, apiKey);
    if (resolvedApiKey) headers.Authorization = `Bearer ${resolvedApiKey}`;
    const req = mod.request(
      target,
      { method: "GET", timeout: 5000, headers },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export function restartGateway(
  profile?: string,
  healthTimeoutMs = 30000,
  healthPollMs = 250,
  stopTimeoutMs = 5000,
): Promise<boolean> {
  void profile;
  void healthTimeoutMs;
  void healthPollMs;
  void stopTimeoutMs;
  return Promise.resolve(false);
}

export async function startGatewayWithRecovery(
  profile?: string,
  healthTimeoutMs = 8000,
  healthPollMs = 250,
  restartCommandTimeoutMs = 15000,
  restartHealthTimeoutMs = 30000,
  restartStopTimeoutMs = 5000,
): Promise<boolean> {
  void healthTimeoutMs;
  void healthPollMs;
  void restartCommandTimeoutMs;
  void restartHealthTimeoutMs;
  void restartStopTimeoutMs;
  if (isRemoteMode()) return false;
  return isGatewayHealthy(profile);
}

export function restartGatewayViaCli(
  profile?: string,
  healthTimeoutMs = 30000,
  healthPollMs = 250,
): Promise<boolean> {
  void profile;
  void healthTimeoutMs;
  void healthPollMs;
  return Promise.resolve(false);
}

export function notifyProfileSwitched(): void {
  apiServerAvailable = null;
}
