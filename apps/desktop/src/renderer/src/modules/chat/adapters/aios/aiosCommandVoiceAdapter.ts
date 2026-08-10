import type { ChatCommandPort } from "../../ports/ChatCommandPort";
import type { ChatVoicePort } from "../../ports/ChatCommandPort";
import { DESKTOP_SLASH_COMMANDS } from "../../components/composer/slashCommands";

const BACKGROUND_ALIASES = new Set(["btw", "bg", "background"]);

/** AI-OS adapter: Runtime command catalog + slash.exec (PRD v1.6 FR-01/FR-02/FR-03). */
export const aiosCommandAdapter: ChatCommandPort = {
  async listCommands() {
    const desktop = DESKTOP_SLASH_COMMANDS.map((c) => ({
      name: c.name,
      description: c.description,
      args: c.args,
    }));
    try {
      if (typeof window.copilotRuntime?.listChatCommands === "function") {
        const res = await window.copilotRuntime.listChatCommands();
        const agent = (res.commands || []).map((c) => ({
          name: c.name,
          description: c.description || `Hermes /${c.name}`,
          args: c.argsHint ?? undefined,
        }));
        const desktopNames = new Set(desktop.map((c) => c.name));
        return [...desktop, ...agent.filter((c) => !desktopNames.has(c.name))];
      }
    } catch {
      /* fall through to desktop-only */
    }
    return desktop;
  },
  async execute(name, args, ctx) {
    const key = name.trim().replace(/^\/+/, "").toLowerCase();

    // Pure Desktop UI commands
    if (key === "help") {
      const cmds = (await this.listCommands?.()) || DESKTOP_SLASH_COMMANDS;
      return {
        ok: true,
        message: cmds.map((c) => `/${c.name} — ${c.description}`).join("\n"),
      };
    }
    if (key === "clear" || key === "new") {
      return { ok: true, message: key };
    }
    if (key === "model" || key === "settings") {
      window.dispatchEvent(new CustomEvent("model-picker:open"));
      return { ok: true };
    }

    // PRD v1.6 FR-03 — /btw background side question
    if (BACKGROUND_ALIASES.has(key)) {
      const activeRunId = ctx.runId;
      if (!activeRunId || typeof window.copilotRuntime?.createBackgroundTurn !== "function") {
        return {
          ok: false,
          message: "Background turn requires an active ChatRun (Runtime)",
        };
      }
      const message = (args || "").trim();
      if (!message) {
        return { ok: false, message: "Usage: /btw <question>" };
      }
      const res = await window.copilotRuntime.createBackgroundTurn(activeRunId, {
        sessionId: ctx.sessionId || undefined,
        message,
      });
      return {
        ok: true,
        message: `background:${res.turnId}`,
      };
    }

    // Agent slash via Runtime
    const activeRunId = ctx.runId;
    if (activeRunId && typeof window.copilotRuntime?.executeChatCommand === "function") {
      const res = await window.copilotRuntime.executeChatCommand(activeRunId, {
        sessionId: ctx.sessionId || undefined,
        name: key,
        args: args || "",
      });
      if (res.result === "error") {
        return { ok: false, message: res.message || `Command /${key} failed` };
      }
      if (res.result === "send_prompt") {
        return { ok: true, message: res.prompt || res.message || "sent" };
      }
      return { ok: true, message: res.output || res.message || "ok" };
    }

    return {
      ok: false,
      message: `Unknown command /${key} (session=${ctx.sessionId || "none"})`,
    };
  },
};

export const aiosVoiceAdapter: ChatVoicePort = {
  supported:
    typeof window !== "undefined" &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition
    ),
};
