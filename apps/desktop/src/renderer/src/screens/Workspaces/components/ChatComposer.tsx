import { useState } from "react";
import { useI18n } from "../../../components/useI18n";
import type { ChatRunState } from "../types";

export function ChatComposer({
  disabled,
  runState,
  onSend,
  onCancel,
  onRetry,
  onStartProfile,
  onRestartProfile,
  showStartProfile,
  showPresetRequired,
  showRestartUnhealthy,
}: {
  disabled: boolean;
  runState: ChatRunState;
  onSend: (text: string) => void;
  onCancel: () => void;
  onRetry?: () => void;
  onStartProfile?: () => void;
  onRestartProfile?: () => void;
  showStartProfile?: boolean;
  showPresetRequired?: boolean;
  showRestartUnhealthy?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const busy =
    runState === "creating" ||
    runState === "streaming" ||
    runState === "waiting_approval";
  const inputDisabled = disabled || busy;

  if (showPresetRequired) {
    return (
      <div className="workspaces-chat-composer-centered">
        <p className="workspaces-chat-composer-hint">
          {t("workspaces.chat.presetRequired", {
            defaultValue: "Install this expert preset before chatting.",
          })}
        </p>
      </div>
    );
  }

  if (showRestartUnhealthy) {
    return (
      <div className="workspaces-chat-composer-centered">
        <p className="workspaces-chat-composer-hint is-warning">
          {t("workspaces.chat.restartUnhealthyHint", {
            defaultValue: "Profile is running but Gateway health check failed. Restart to recover.",
          })}
        </p>
        <button type="button" className="workspaces-chat-btn-warning" onClick={onRestartProfile}>
          {t("workspaces.runtime.restart", { defaultValue: "Restart" })}
        </button>
      </div>
    );
  }

  if (showStartProfile) {
    return (
      <div className="workspaces-chat-composer-centered">
        <p className="workspaces-chat-composer-hint">
          {t("workspaces.chat.startProfileHint", {
            defaultValue: "Profile is not running. Start it to chat.",
          })}
        </p>
        <button type="button" className="workspaces-chat-btn-primary" onClick={onStartProfile}>
          {t("workspaces.runtime.start", { defaultValue: "Start Profile" })}
        </button>
      </div>
    );
  }

  return (
    <form
      className="workspaces-chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || inputDisabled) return;
        setInput("");
        onSend(text);
      }}
    >
      <input
        className="workspaces-chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("navigation.chatPlaceholder", { defaultValue: "Message…" })}
        disabled={inputDisabled}
      />
      {runState === "error" && onRetry ? (
        <button type="button" className="workspaces-chat-btn-primary" onClick={onRetry}>
          {t("workspaces.chat.retry", { defaultValue: "Retry" })}
        </button>
      ) : null}
      {busy ? (
        <button type="button" className="workspaces-chat-btn-secondary" onClick={onCancel}>
          {t("common.cancel", { defaultValue: "Cancel" })}
        </button>
      ) : runState !== "error" ? (
        <button
          type="submit"
          className="workspaces-chat-btn-primary"
          disabled={inputDisabled || !input.trim()}
        >
          {t("navigation.send", { defaultValue: "Send" })}
        </button>
      ) : null}
    </form>
  );
}
