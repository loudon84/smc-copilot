import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUp, Mic, Paperclip, Square as Stop } from "lucide-react";
import type { ChatAttachmentState } from "../../controller/chatViewTypes";
import type { ChatFilesPort } from "../../ports/ChatFilesPort";
import type { ChatCommandPort } from "../../ports/ChatCommandPort";
import { isImeComposing } from "./keyboard";
import { useInputHistory, useVoiceInput } from "./composerHooks";
import { ContextGauge, type ContextUsage } from "./ContextGauge";
import { QueuedMessages } from "./QueuedMessages";
import {
  DESKTOP_SLASH_COMMANDS,
  filterSlashCommands,
  type SlashCommand,
} from "./slashCommands";

export type ChatInputHandle = {
  setText(text: string): void;
  appendText(text: string): void;
  clear(): void;
  focus(): void;
  addFiles(files: File[] | FileList): Promise<void>;
};

export type ChatInputReadiness = {
  ok: boolean;
  message?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onAbort: () => void;
  isBusy: boolean;
  attachments?: ChatAttachmentState[];
  onAddAttachments?: (files: File[]) => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  toolbarExtras?: React.ReactNode;
  filesToggle?: React.ReactNode;
  contextUsage?: ContextUsage | null;
  readiness?: ChatInputReadiness;
  queue?: Array<{ text: string; attachmentsCount?: number }>;
  onRemoveQueued?: (index: number) => void;
  files?: ChatFilesPort;
  commands?: ChatCommandPort;
  sessionId?: string | null;
  profileId?: string;
  disabled?: boolean;
};

export const CopilotChatInput = forwardRef<ChatInputHandle, Props>(
  function CopilotChatInput(
    {
      value,
      onChange,
      onSend,
      onAbort,
      isBusy,
      attachments = [],
      onAddAttachments,
      onRemoveAttachment,
      toolbarExtras,
      filesToggle,
      contextUsage,
      readiness,
      queue = [],
      onRemoveQueued,
      commands,
      sessionId,
      profileId,
      disabled,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(
      DESKTOP_SLASH_COMMANDS,
    );
    const history = useInputHistory();

    const voice = useVoiceInput((text) => {
      onChange(value ? `${value} ${text}` : text);
    });

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        if (!commands?.listCommands) return;
        try {
          const list = await commands.listCommands();
          if (!cancelled && list.length) setSlashCommands(list);
        } catch {
          /* keep defaults */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [commands]);

    const resize = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, []);

    useEffect(() => {
      resize();
    }, [value, resize]);

    useImperativeHandle(
      ref,
      () => ({
        setText(text) {
          onChange(text);
          requestAnimationFrame(() => textareaRef.current?.focus());
        },
        appendText(text) {
          onChange(value ? `${value}${text}` : text);
        },
        clear() {
          onChange("");
        },
        focus() {
          textareaRef.current?.focus();
        },
        async addFiles(files) {
          const list = Array.from(files);
          if (list.length) await onAddAttachments?.(list);
        },
      }),
      [onAddAttachments, onChange, value],
    );

    const filteredSlash = useMemo(
      () =>
        slashQuery == null
          ? []
          : filterSlashCommands(slashCommands, slashQuery),
      [slashCommands, slashQuery],
    );

    const ingestFiles = useCallback(
      async (files: FileList | File[] | null) => {
        if (!files || files.length === 0) return;
        await onAddAttachments?.(Array.from(files));
      },
      [onAddAttachments],
    );

    const submit = useCallback(async () => {
      const text = value.trim();
      if (!text && attachments.length === 0) return;
      if (text.startsWith("/")) {
        const match = text.match(/^\/(\S+)(?:\s+(.*))?$/);
        if (match && commands?.execute) {
          const name = match[1];
          const args = match[2] || "";
          const res = await commands.execute(name, args, {
            sessionId,
            profileId,
          });
          if (res.ok) {
            if (name === "clear") onChange("");
            history.push(text);
            if (name !== "clear" && name !== "new" && name !== "model") {
              /* help etc. — leave value or clear */
              onChange("");
            } else if (name === "model") {
              onChange("");
            }
            return;
          }
        }
      }
      history.push(text);
      onSend(text);
    }, [
      attachments.length,
      commands,
      history,
      onChange,
      onSend,
      profileId,
      sessionId,
      value,
    ]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isImeComposing(e)) return;

      if (slashQuery != null && filteredSlash.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((i) => (i + 1) % filteredSlash.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex(
            (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const cmd = filteredSlash[slashIndex];
          if (cmd) {
            onChange(`/${cmd.name} `);
            setSlashQuery(null);
          }
          return;
        }
        if (e.key === "Escape") {
          setSlashQuery(null);
          return;
        }
      }

      if (e.key === "ArrowUp" && !value.trim()) {
        e.preventDefault();
        const older = history.older(value);
        if (older != null) onChange(older);
        return;
      }
      if (e.key === "ArrowDown") {
        const newer = history.newer();
        if (newer != null) {
          e.preventDefault();
          onChange(newer);
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isBusy) {
          // Queue is handled by controller send(); still invoke onSend so text queues.
        }
        void submit();
      }
    };

    const onTextChange = (next: string) => {
      onChange(next);
      if (next.startsWith("/") && !next.includes("\n")) {
        const q = next.slice(1).split(/\s/)[0] ?? "";
        setSlashQuery(q);
        setSlashIndex(0);
      } else {
        setSlashQuery(null);
      }
    };

    const sendDisabled =
      disabled ||
      (readiness && !readiness.ok) ||
      (!value.trim() && attachments.length === 0);

    return (
      <div
        className={`copilot-composer${dragOver ? " copilot-composer--drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void ingestFiles(e.dataTransfer.files);
        }}
      >
        <QueuedMessages
          messages={queue}
          onRemove={(i) => onRemoveQueued?.(i)}
        />
        {attachments.length > 0 && (
          <div className="copilot-attachment-tray">
            {attachments.map((a) => (
              <div key={a.id} className="chat-attachment-chip">
                <span>{a.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => onRemoveAttachment?.(a.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="copilot-composer-input"
          value={value}
          rows={1}
          placeholder="Message Hermes… (/ for commands)"
          disabled={disabled}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = e.clipboardData?.files;
            if (files && files.length > 0) {
              e.preventDefault();
              void ingestFiles(files);
            }
          }}
        />
        {slashQuery != null && filteredSlash.length > 0 && (
          <ul className="copilot-slash-menu" role="listbox">
            {filteredSlash.map((cmd, i) => (
              <li key={cmd.name}>
                <button
                  type="button"
                  className={
                    i === slashIndex
                      ? "copilot-slash-item copilot-slash-item--active"
                      : "copilot-slash-item"
                  }
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    onChange(`/${cmd.name} `);
                    setSlashQuery(null);
                  }}
                >
                  <strong>/{cmd.name}</strong>
                  <span>{cmd.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {readiness && !readiness.ok && readiness.message && (
          <div className="copilot-composer-error">{readiness.message}</div>
        )}
        <div className="copilot-composer-toolbar">
          <div className="copilot-composer-toolbar-left">
            <button
              type="button"
              className="copilot-icon-btn"
              title="Attach files"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void ingestFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {voice.supported && (
              <button
                type="button"
                className={`copilot-icon-btn${voice.listening ? " is-active" : ""}`}
                title="Voice input"
                onClick={voice.toggle}
                disabled={disabled}
              >
                <Mic size={16} />
              </button>
            )}
            {toolbarExtras}
            {filesToggle}
          </div>
          <div className="copilot-composer-toolbar-right">
            {contextUsage && <ContextGauge {...contextUsage} />}
            {isBusy ? (
              <button
                type="button"
                className="copilot-send-btn copilot-stop-btn"
                onClick={onAbort}
                title="Stop"
              >
                <Stop size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="copilot-send-btn"
                onClick={() => void submit()}
                disabled={sendDisabled}
                title="Send"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default CopilotChatInput;
