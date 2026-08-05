import { randomBytes } from "crypto";
import { ChildProcess, spawn } from "child_process";
import { existsSync, readFileSync, appendFileSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import http from "http";
import https from "https";
import {
  HERMES_HOME,
  getHermesPython,
  getHermesRepo,
  getHermesScript,
  getEnhancedPath,
} from "./installer";
import {
  getModelConfig,
  readEnv,
  setEnvValue,
  getConnectionConfig,
  getFullConnectionConfig,
  syncGatewayModelSection,
} from "./config";
import { getSshTunnelUrl, isSshTunnelActive, isSshTunnelHealthy, startSshTunnel } from "./ssh-tunnel";
import { stripAnsi } from "./utils";
import { buildUserMessageContent } from "./hermes-default-chat/hermes-default-chat-attachments";
import { buildGatewayChatCompletionsBody } from "./hermes-default-chat/hermes-default-chat-request";
import {
  isWebOperatorPanelDraftSession,
  resolveModelIdForSend,
} from "./hermes-default-chat/hermes-default-chat-models";
import {
  buildChatModelRoutingLog,
  logChatModelRouting,
} from "./hermes-default-chat/hermes-chat-model-routing";
import { applyCustomEndpointEnv } from "./hermes-model-env";
import {
  overlayGatewayModelSectionForSession,
  syncCustomProvidersFromModels,
} from "./hermes-config/hermes-config-yaml";
import type { HermesChatAttachmentMeta } from "../shared/hermes-default-chat/hermes-default-chat-contract";
import {
  isExpertManagedProfile,
  resolveExpertGatewayUrl,
} from "./hermes-experts/expert-profile-manager";
import { getRuntimeInstance } from "./profile-runtime-db";
import { resolveProfileId, startProfile } from "./profile-runtime-manager";

const LOCAL_API_URL = "http://127.0.0.1:8642";

export function getApiUrl(profile?: string): string {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    const sshUrl = getSshTunnelUrl();
    if (!sshUrl) throw new Error("SSH tunnel is not active");
    return sshUrl;
  }
  if (conn.mode === "remote" && conn.remoteUrl) {
    return conn.remoteUrl.replace(/\/+$/, "");
  }
  const expertUrl = resolveExpertGatewayUrl(profile);
  if (expertUrl) return expertUrl;
  return LOCAL_API_URL;
}

export function isRemoteMode(): boolean {
  const mode = getConnectionConfig().mode;
  return mode === "remote" || mode === "ssh";
}

/** True only for pure remote HTTP — SSH tunnel has full local access via SSH exec */
export function isRemoteOnlyMode(): boolean {
  return getConnectionConfig().mode === "remote";
}

// Cached API key read from the remote .env when SSH tunnel starts
let _sshRemoteApiKey = "";

export function setSshRemoteApiKey(key: string): void {
  _sshRemoteApiKey = key;
}

/** Auth headers for Gateway HTTP (/health, /v1/chat/completions). */
export function getRemoteAuthHeader(profile?: string): Record<string, string> {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    if (_sshRemoteApiKey) return { Authorization: `Bearer ${_sshRemoteApiKey}` };
    return {};
  }
  if (conn.mode === "remote" && conn.hasApiKey) {
    const apiKey = getFullConnectionConfig().apiKey;
    if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  }
  const env = readEnv(profile);
  const serverKey = env.API_SERVER_KEY?.trim();
  if (!serverKey) return {};
  const enabled = env.API_SERVER_ENABLED?.trim().toLowerCase();
  if (enabled === "false" || enabled === "0") return {};
  return { Authorization: `Bearer ${serverKey}` };
}

export async function ensureSshTunnelIfNeeded(): Promise<void> {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh" && (!isSshTunnelActive() || !await isSshTunnelHealthy())) {
    await startSshTunnel(conn.ssh);
  }
}

interface ChatHandle {
  abort: () => void;
}

export type HermesSendMessageOptions = {
  attachmentIds?: string[];
  attachmentMetas?: HermesChatAttachmentMeta[];
  modelId?: string;
  sessionId?: string;
  selectedModel?: string;
  selectedBaseUrl?: string;
};

type ChatMessageContent =
  | string
  | Array<{ type: string; text?: string; image_url?: { url: string } }>;

/**
 * Model id for POST /v1/chat/completions to the Hermes API server.
 * This is the advertised API model (hermes-agent / profile name), not the
 * LLM id from config.yaml — upstream routing uses config server-side.
 */
function resolveApiServerModelName(profile?: string): string {
  const env = readEnv(profile);
  const fromEnv = env.API_SERVER_MODEL_NAME?.trim();
  if (fromEnv) return fromEnv;
  const id = profile?.trim();
  if (id && id !== "default") return id;
  return "hermes-agent";
}

function sanitizeChatHistory(
  history: Array<{ role: string; content: string }> | undefined,
  currentMessage: string,
): Array<{ role: string; content: string }> {
  if (!history?.length) return [];
  const trimmedCurrent = currentMessage.trim();
  const out: Array<{ role: string; content: string }> = [];
  for (const msg of history) {
    const content = msg.content?.trim() ?? "";
    if (!content) continue;
    const role = msg.role === "agent" ? "assistant" : msg.role;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    // Avoid duplicating the message we append as the final user turn
    if (role === "user" && content === trimmedCurrent) continue;
    out.push({ role, content });
  }
  return out;
}

// ────────────────────────────────────────────────────
//  API Server health check
// ────────────────────────────────────────────────────

function isApiServerReady(profile?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `${getApiUrl(profile)}/health`;
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      { method: "GET", timeout: 1500, headers: getRemoteAuthHeader(profile) },
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

// ────────────────────────────────────────────────────
//  Ensure API server is enabled in config
// ────────────────────────────────────────────────────

function ensureApiServerConfig(): void {
  try {
    const configPath = join(HERMES_HOME, "config.yaml");
    if (!existsSync(configPath)) return;
    const content = readFileSync(configPath, "utf-8");
    // If api_server is already configured, skip
    if (/api_server/i.test(content)) return;
    const addition = `
# Desktop app API server (auto-configured)
platforms:
  api_server:
    enabled: true
    extra:
      port: 8642
      host: "127.0.0.1"
`;
    appendFileSync(configPath, addition, "utf-8");
  } catch {
    /* non-fatal */
  }
}

/**
 * Gateway session continuation (`x-hermes-session-id`) requires Bearer auth.
 * Auto-provision a local-only key so WebOperator / Local Hermes chat work out of the box.
 * @returns true when a new key was written (gateway restart may be required).
 */
function ensureApiServerKey(profile?: string): boolean {
  if (isRemoteMode()) return false;
  const env = readEnv(profile);
  if (env.API_SERVER_KEY?.trim()) return false;

  const key = randomBytes(32).toString("hex");
  setEnvValue("API_SERVER_KEY", key, profile);
  const enabled = env.API_SERVER_ENABLED?.trim().toLowerCase();
  if (!enabled || enabled === "false" || enabled === "0") {
    setEnvValue("API_SERVER_ENABLED", "true", profile);
  }
  console.log("[Hermes] Auto-provisioned API_SERVER_KEY for local session continuation");
  return true;
}

async function ensureLocalApiServerAuth(profile?: string): Promise<void> {
  if (isRemoteMode()) return;
  const keyCreated = ensureApiServerKey(profile);
  if (keyCreated && isGatewayRunning()) {
    await restartGatewayAsync(profile);
    apiServerAvailable = null;
  }
}

// ────────────────────────────────────────────────────
//  HTTP API streaming (fast path — no process spawn)
// ────────────────────────────────────────────────────

export interface ChatCallbacks {
  onChunk: (text: string) => void;
  onDone: (sessionId?: string) => void;
  onError: (error: string) => void;
  onToolProgress?: (tool: string) => void;
  onSessionStarted?: (sessionId: string) => void;
  onReasoningDelta?: (content: string) => void;
  onToolEvent?: (event: {
    callId: string;
    name: string;
    status: "running" | "completed" | "failed";
    label?: string;
    preview?: string;
    result?: string;
  }) => void;
  onClarifyRequested?: (request: {
    requestId: string;
    question: string;
    choices?: string[];
  }) => void;
  onApprovalRequested?: (request: {
    requestId: string;
    toolName: string;
    summary: string;
    riskLevel?: "low" | "medium" | "high";
  }) => void;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
  }) => void;
}

async function sendMessageViaApi(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  _resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  options?: HermesSendMessageOptions,
  routingMeta?: { syncedConfig: boolean; restartedGateway: boolean },
): Promise<ChatHandle> {
  const controller = new AbortController();

  const userContent: ChatMessageContent = await buildUserMessageContent(
    message,
    profile,
    options?.attachmentIds ?? [],
    options?.attachmentMetas,
  );

  // Build full conversation from history + current message (standard OpenAI format)
  const messages: Array<{ role: string; content: ChatMessageContent }> = [
    ...sanitizeChatHistory(history, message),
    { role: "user", content: userContent },
  ];

  const saved = resolveModelIdForSend(options?.modelId, profile);
  const panelDraft = isWebOperatorPanelDraftSession(options?.sessionId);
  // WebOperator 侧栏：仅 request 级 provider/base_url，禁止写 config.yaml `model:` 段。
  if (saved && !panelDraft) {
    const overlayApplied = overlayGatewayModelSectionForSession(profile, saved);
    if (overlayApplied && routingMeta) {
      routingMeta.syncedConfig = true;
    }
  }

  const apiServerModel = resolveApiServerModelName(profile);
  const payload = buildGatewayChatCompletionsBody(
    messages,
    profile,
    options?.modelId,
    apiServerModel,
  );
  const gatewayCompletionsUrl = `${getApiUrl(profile).replace(/\/+$/, "")}/v1/chat/completions`;
  logChatModelRouting(
    buildChatModelRoutingLog({
      profile,
      sessionId: options?.sessionId,
      modelId: options?.modelId,
      apiServerModel,
      payload,
      gatewayCompletionsUrl,
      syncedConfig: routingMeta?.syncedConfig ?? false,
      restartedGateway: routingMeta?.restartedGateway ?? false,
      selectedModel: options?.selectedModel,
      selectedBaseUrl: options?.selectedBaseUrl,
    }),
  );
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getRemoteAuthHeader(profile),
  };
  const resumeId = _resumeSessionId?.trim();
  if (resumeId) {
    headers["x-hermes-session-id"] = resumeId;
  }

  let sessionId = _resumeSessionId || "";
  let hasContent = false;
  let finished = false; // guard against double callbacks
  let lastError = ""; // capture embedded error messages
  // Tool progress pattern: `emoji tool_name` or `emoji description`
  const toolProgressRe = /^`([^\s`]+)\s+([^`]+)`$/;

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    if (error) {
      cb.onError(error);
    } else {
      cb.onDone(sessionId || undefined);
    }
  }

  function probeRealError(): void {
    // When streaming returns empty, make a non-streaming request to surface the real error
    const probePayload = buildGatewayChatCompletionsBody(
      [{ role: "user", content: message }],
      profile,
      options?.modelId,
      resolveApiServerModelName(profile),
    );
    const probeBody = JSON.stringify({ ...probePayload, stream: false });
    const probeUrl = `${getApiUrl(profile)}/v1/chat/completions`;
    const probeMod = probeUrl.startsWith("https") ? https : http;
    const probeReq = probeMod.request(
      probeUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getRemoteAuthHeader(profile),
        },
      },
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
    probeReq.write(probeBody);
    probeReq.end();
  }

  /** Handle a custom SSE event (non-data lines with `event:` prefix). */
  function processCustomEvent(eventType: string, data: string): void {
    if (eventType === "hermes.tool.progress" && cb.onToolProgress) {
      try {
        const payload = JSON.parse(data);
        const label = payload.label || payload.tool || "";
        const emoji = payload.emoji || "";
        cb.onToolProgress(emoji ? `${emoji} ${label}` : label);
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.session.started" && cb.onSessionStarted) {
      try {
        const payload = JSON.parse(data);
        const sid = payload.session_id || payload.sessionId;
        if (typeof sid === "string" && sid.trim()) cb.onSessionStarted(sid);
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.reasoning.delta" && cb.onReasoningDelta) {
      try {
        const payload = JSON.parse(data);
        const content = payload.content || payload.delta || "";
        if (content) cb.onReasoningDelta(String(content));
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.tool.event" && cb.onToolEvent) {
      try {
        const payload = JSON.parse(data);
        cb.onToolEvent({
          callId: String(payload.call_id || payload.callId || payload.id || ""),
          name: String(payload.name || payload.tool || "tool"),
          status: (payload.status || "running") as "running" | "completed" | "failed",
          label: payload.label,
          preview: payload.preview,
          result: payload.result,
        });
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.clarify.requested" && cb.onClarifyRequested) {
      try {
        const payload = JSON.parse(data);
        cb.onClarifyRequested({
          requestId: String(payload.request_id || payload.requestId || ""),
          question: String(payload.question || ""),
          choices: Array.isArray(payload.choices) ? payload.choices.map(String) : undefined,
        });
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.approval.requested" && cb.onApprovalRequested) {
      try {
        const payload = JSON.parse(data);
        cb.onApprovalRequested({
          requestId: String(payload.request_id || payload.requestId || ""),
          toolName: String(payload.tool_name || payload.toolName || ""),
          summary: String(payload.summary || ""),
          riskLevel: payload.risk_level || payload.riskLevel,
        });
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.usage" && cb.onUsage) {
      try {
        const payload = JSON.parse(data);
        cb.onUsage({
          promptTokens: payload.prompt_tokens || payload.promptTokens || 0,
          completionTokens: payload.completion_tokens || payload.completionTokens || 0,
          totalTokens: payload.total_tokens || payload.totalTokens || 0,
          cost: payload.cost,
          rateLimitRemaining: payload.rate_limit_remaining || payload.rateLimitRemaining,
          rateLimitReset: payload.rate_limit_reset || payload.rateLimitReset,
        });
      } catch {
        /* malformed — skip */
      }
      return;
    }
    if (eventType === "hermes.failed" && cb.onError) {
      try {
        const payload = JSON.parse(data);
        cb.onError(String(payload.message || payload.error || "Hermes failed"));
      } catch {
        cb.onError("Hermes failed");
      }
      return;
    }
    if (eventType === "hermes.completed") {
      try {
        const payload = JSON.parse(data);
        const sid = payload.session_id || payload.sessionId;
        if (sid && cb.onSessionStarted) cb.onSessionStarted(String(sid));
      } catch {
        /* ignore */
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
        // Streaming returned empty — probe non-streaming to get the real error
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
        });
      }

      if (delta?.content) {
        const content = delta.content.trim();
        // Legacy: Detect tool progress lines injected into content: `🔍 search_web`
        const match = toolProgressRe.exec(content);
        if (match && cb.onToolProgress) {
          cb.onToolProgress(`${match[1]} ${match[2]}`);
        } else {
          hasContent = true;
          cb.onChunk(delta.content);
        }
      }
    } catch {
      /* malformed chunk — skip */
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
      if (sid && typeof sid === "string") sessionId = sid;

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
          // Custom event (e.g. hermes.tool.progress) — never signals [DONE]
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
        // Signal completion — even when no content was received
        if (!hasContent && !lastError) {
          probeRealError();
          return;
        }
        finish(hasContent ? undefined : lastError);
      });

      res.on("error", (err) => finish(`Stream error: ${err.message}`));
    },
  );

  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`API request failed: ${err.message}`);
  });
  req.on("timeout", () => {
    req.destroy();
    finish("API request timed out. Check the SSH tunnel and remote Hermes gateway.");
  });

  req.write(body);
  req.end();

  return {
    abort: () => {
      controller.abort();
    },
  };
}

// ────────────────────────────────────────────────────
//  CLI fallback (slow path — spawns process)
// ────────────────────────────────────────────────────

const NOISE_PATTERNS = [/^[╭╰│╮╯─┌┐└┘┤├┬┴┼]/, /⚕\s*Hermes/];

/** Windows venv ships pythonw.exe (GUI subsystem, no console). */
function getHermesPythonw(): string | null {
  if (process.platform !== "win32") return null;
  const pythonw = getHermesPython().replace(/python\.exe$/i, "pythonw.exe");
  return existsSync(pythonw) ? pythonw : null;
}

function spawnHermesGatewayProcess(
  cliArgs: string[],
  env: Record<string, string>,
): ChildProcess {
  const cwd = getHermesRepo();

  if (process.platform === "win32") {
    const pythonw = getHermesPythonw();
    if (pythonw) {
      // pythonw.exe has no console — safe with detached for background gateway.
      return spawn(pythonw, ["-m", "hermes_cli.main", ...cliArgs], {
        cwd,
        env,
        stdio: "ignore",
        detached: true,
        shell: false,
      });
    }
    // CREATE_NO_WINDOW is ignored when detached:true on Windows; stay attached.
    return spawn(getHermesPython(), ["-m", "hermes_cli.main", ...cliArgs], {
      cwd,
      env,
      stdio: "ignore",
      detached: false,
      windowsHide: true,
      shell: false,
    });
  }

  return spawn(getHermesScript(), cliArgs, {
    cwd,
    env,
    stdio: "ignore",
    detached: true,
    shell: false,
  });
}

/**
 * Windows `hermes.exe` / `python.exe` console shims may show a CMD window.
 * Gateway: prefer `pythonw.exe`; CLI chat: `python -m hermes_cli.main` + windowsHide (attached).
 */
function spawnHermesCli(
  cliArgs: string[],
  env: Record<string, string>,
): ChildProcess {
  if (process.platform === "win32") {
    return spawn(getHermesPython(), ["-m", "hermes_cli.main", ...cliArgs], {
      cwd: getHermesRepo(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }
  return spawn(getHermesScript(), cliArgs, {
    cwd: getHermesRepo(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sendMessageViaCli(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  options?: HermesSendMessageOptions,
): ChatHandle {
  const profileEnv = readEnv(profile);
  const saved = resolveModelIdForSend(options?.modelId, profile);
  const mc = saved
    ? { provider: saved.provider, model: saved.model, baseUrl: saved.baseUrl }
    : getModelConfig(profile);

  const args: string[] = [];
  if (profile && profile !== "default") {
    args.push("-p", profile);
  }
  args.push("chat", "-q", message, "-Q", "--source", "desktop");

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  if (mc.model) {
    args.push("-m", mc.model);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME: HERMES_HOME,
    PYTHONUNBUFFERED: "1",
    HERMES_QUIET: "1",
  };

  // Inject all API keys from the profile .env so the CLI can access them
  const KNOWN_API_KEYS = [
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "GROQ_API_KEY",
    "GLM_API_KEY",
    "KIMI_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_CN_API_KEY",
    "HF_TOKEN",
    "EXA_API_KEY",
    "PARALLEL_API_KEY",
    "TAVILY_API_KEY",
    "FIRECRAWL_API_KEY",
    "FAL_KEY",
    "HONCHO_API_KEY",
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "VOICE_TOOLS_OPENAI_KEY",
    "TINKER_API_KEY",
    "WANDB_API_KEY",
  ];
  for (const key of KNOWN_API_KEYS) {
    if (profileEnv[key] && !env[key]) {
      env[key] = profileEnv[key];
    }
  }

  applyCustomEndpointEnv(env, profileEnv, mc);

  const proc = spawnHermesCli(args, env);

  let hasOutput = false;
  let capturedSessionId = "";
  let outputBuffer = "";

  function processOutput(raw: Buffer): void {
    const text = stripAnsi(raw.toString());
    outputBuffer += text;

    const sidMatch = outputBuffer.match(/session_id:\s*(\S+)/);
    if (sidMatch) capturedSessionId = sidMatch[1];

    const cleaned = text.replace(/session_id:\s*\S+\n?/g, "");
    const lines = cleaned.split("\n");
    const result: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t && NOISE_PATTERNS.some((p) => p.test(t))) continue;
      result.push(line);
    }

    const output = result.join("\n");
    if (output) {
      hasOutput = true;
      cb.onChunk(output);
    }
  }

  proc.stdout?.on("data", processOutput);

  let stderrBuffer = "";
  proc.stderr?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    if (
      !text.trim() ||
      text.includes("UserWarning") ||
      text.includes("FutureWarning")
    ) {
      return;
    }
    // Forward errors visibly to the chat
    if (
      /❌|⚠️|Error|Traceback|error|failed|denied|unauthorized|invalid/i.test(
        text,
      )
    ) {
      hasOutput = true;
      cb.onChunk(text);
    } else {
      // Buffer other stderr for reporting on non-zero exit
      stderrBuffer += text;
    }
  });

  proc.on("close", (code) => {
    if (code === 0 || hasOutput) {
      cb.onDone(capturedSessionId || undefined);
    } else {
      const detail = stderrBuffer.trim();
      cb.onError(
        detail
          ? `Hermes exited with code ${code}: ${detail}`
          : `Hermes exited with code ${code}. Check your model configuration and API key.`,
      );
    }
  });

  proc.on("error", (err) => {
    cb.onError(err.message);
  });

  return {
    abort: () => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 3000);
    },
  };
}

// ────────────────────────────────────────────────────
//  Public API: auto-routes to HTTP API or CLI fallback
// ────────────────────────────────────────────────────

let apiServerAvailable: boolean | null = null; // cached after first check
let chatProviderCredentialsSynced = false;

function prepareChatProviderCredentials(profile?: string): void {
  if (chatProviderCredentialsSynced || isRemoteMode()) return;
  chatProviderCredentialsSynced = true;
  const configChanged = syncCustomProvidersFromModels(profile);
  if (configChanged && isGatewayRunning()) {
    restartGateway(profile);
  }
}

export async function sendMessage(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
  options?: HermesSendMessageOptions,
): Promise<ChatHandle> {
  ensureInitialized();

  const routingMeta = {
    syncedConfig: false,
    restartedGateway: false,
  };

  prepareChatProviderCredentials(profile);
  await ensureLocalApiServerAuth(profile);

  // Remote mode: always use API, no CLI fallback
  if (isRemoteMode()) {
    return sendMessageViaApi(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      options,
      routingMeta,
    );
  }

  // Check API server availability (cache the result, re-check periodically)
  if (apiServerAvailable === null || apiServerAvailable === false) {
    apiServerAvailable = await isApiServerReady(profile);
  }

  if (apiServerAvailable) {
    return sendMessageViaApi(
      message,
      cb,
      profile,
      resumeSessionId,
      history,
      options,
      routingMeta,
    );
  }

  // Fallback to CLI when Gateway API is unavailable; attachments not supported on CLI path
  if (options?.modelId) {
    const apiServerModel = resolveApiServerModelName(profile);
    const payload = buildGatewayChatCompletionsBody(
      [{ role: "user", content: message }],
      profile,
      options.modelId,
      apiServerModel,
    );
    logChatModelRouting(
      buildChatModelRoutingLog({
        profile,
        sessionId: options.sessionId,
        modelId: options.modelId,
        apiServerModel,
        payload,
        gatewayCompletionsUrl: "(CLI fallback)",
        syncedConfig: routingMeta.syncedConfig,
        restartedGateway: routingMeta.restartedGateway,
        selectedModel: options.selectedModel,
        selectedBaseUrl: options.selectedBaseUrl,
      }),
    );
  }

  return sendMessageViaCli(message, cb, profile, resumeSessionId, options);
}

// Lazy init — called on first sendMessage or gateway start
let _initialized = false;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let _healthStatusCallback: ((running: boolean) => void) | null = null;

/**
 * Set a callback to be called when health status changes
 */
export function setHealthStatusCallback(callback: ((running: boolean) => void) | null): void {
  _healthStatusCallback = callback;
}

function ensureInitialized(): void {
  if (_initialized) return;
  _initialized = true;
  if (!isRemoteMode()) {
    ensureApiServerConfig();
    ensureApiServerKey();
  }
  startHealthPolling();
}

function startHealthPolling(): void {
  if (_healthCheckInterval) return;
  _healthCheckInterval = setInterval(async () => {
    const wasAvailable = apiServerAvailable;
    apiServerAvailable = await isApiServerReady();
    
    // Notify callback on status change
    if (wasAvailable !== apiServerAvailable && _healthStatusCallback) {
      _healthStatusCallback(apiServerAvailable);
    }
    
    // Stop polling once API is confirmed available — only re-check on demand
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

let gatewayProcess: ChildProcess | null = null;
let gatewayStartedByApp = false;

export function startGateway(profile?: string): boolean {
  ensureInitialized();
  if (profile && profile !== "default" && isExpertManagedProfile(profile)) {
    ensureApiServerKey(profile);
    void startProfile(resolveProfileId(profile)).catch((err) => {
      console.error(`[Hermes] expert profile start failed (${profile}):`, err);
    });
    return true;
  }

  ensureApiServerKey(profile);
  const configSynced = syncGatewayModelSection(profile);
  if (configSynced && isGatewayRunning()) {
    restartGateway(profile);
    return false;
  }
  if (isGatewayRunning()) return false;

  // Build gateway env with profile API keys
  const gatewayEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    HERMES_HOME: HERMES_HOME,
    API_SERVER_ENABLED: "true", // Ensure API server starts with gateway
  };

  // Inject ALL profile API keys so the gateway can authenticate with any provider.
  const profileEnv = readEnv(profile);
  for (const [key, value] of Object.entries(profileEnv)) {
    if (value) {
      gatewayEnv[key] = value;
    }
  }

  gatewayProcess = spawnHermesGatewayProcess(["gateway"], gatewayEnv);

  gatewayProcess.unref();

  gatewayProcess.on("close", () => {
    gatewayProcess = null;
    gatewayStartedByApp = false;
    apiServerAvailable = false;
    // Restart health polling to detect if gateway comes back
    startHealthPolling();
  });

  gatewayStartedByApp = true;

  // Wait a bit then check if API server came up
  setTimeout(async () => {
    apiServerAvailable = await isApiServerReady();
  }, 3000);

  return true;
}

function readPidFile(): number | null {
  const pidFile = join(HERMES_HOME, "gateway.pid");
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

export function stopGateway(force = false): void {
  if (!force && !gatewayStartedByApp) return;

  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill("SIGTERM");
    gatewayProcess = null;
  }
  const pid = readPidFile();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
  }
  // Always clear the PID file once we've signalled it. Leaving a stale PID
  // around means the next isGatewayRunning() / stopGateway() call can hit
  // an unrelated process that the OS has since assigned the same PID.
  const pidFile = join(HERMES_HOME, "gateway.pid");
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile);
    } catch {
      // best-effort; will be overwritten on next gateway start
    }
  }
  gatewayStartedByApp = false;
  apiServerAvailable = false;
}

export function isGatewayRunning(profile?: string): boolean {
  if (profile && profile !== "default" && isExpertManagedProfile(profile)) {
    const instance = getRuntimeInstance(resolveProfileId(profile));
    return instance?.status === "running";
  }
  if (gatewayProcess && !gatewayProcess.killed) return true;
  const pid = readPidFile();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isApiReady(): boolean {
  return apiServerAvailable === true;
}

export function testRemoteConnection(
  url: string,
  apiKey?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const target = `${url.replace(/\/+$/, "")}/health`;
    const mod = target.startsWith("https") ? https : http;
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
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

export function restartGateway(profile?: string): void {
  if (!isGatewayRunning()) return;
  stopGateway(true);
  setTimeout(() => {
    startGateway(profile);
  }, 500);
}

/** Restart gateway and wait until API health responds (local mode model switch). */
export function restartGatewayAsync(profile?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!isGatewayRunning()) {
      resolve();
      return;
    }
    stopGateway(true);
    apiServerAvailable = false;
    setTimeout(() => {
      startGateway(profile);
      let attempts = 0;
      const poll = (): void => {
        void isApiServerReady(profile).then((ok) => {
          if (ok) {
            apiServerAvailable = true;
            resolve();
            return;
          }
          attempts += 1;
          if (attempts >= 24) {
            resolve();
            return;
          }
          setTimeout(poll, 250);
        });
      };
      setTimeout(poll, 400);
    }, 500);
  });
}
