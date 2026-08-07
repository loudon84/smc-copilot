import type { ChatCommandPort } from "../../ports/ChatCommandPort";
import type { ChatVoicePort } from "../../ports/ChatCommandPort";
import { DESKTOP_SLASH_COMMANDS } from "../../components/composer/slashCommands";

export const aiosCommandAdapter: ChatCommandPort = {
  async listCommands() {
    return DESKTOP_SLASH_COMMANDS;
  },
  async execute(name, _args, ctx) {
    if (name === "help") {
      return {
        ok: true,
        message: DESKTOP_SLASH_COMMANDS.map(
          (c) => `/${c.name} — ${c.description}`,
        ).join("\n"),
      };
    }
    if (name === "clear" || name === "new") {
      return { ok: true, message: name };
    }
    if (name === "model") {
      window.dispatchEvent(new CustomEvent("model-picker:open"));
      return { ok: true };
    }
    return {
      ok: false,
      message: `Unknown command /${name} (session=${ctx.sessionId || "none"})`,
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
