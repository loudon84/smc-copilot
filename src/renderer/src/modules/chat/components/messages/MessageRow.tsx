import { memo, useCallback, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Copy, Check } from "lucide-react";
import { AgentMarkdown } from "@renderer/components/AgentMarkdown";
import { useI18n } from "@renderer/components/useI18n";
import type { ChatViewItem } from "../../controller/chatViewTypes";
import { HermesAvatar, AvatarSpacer, type AgentAvatarInfo } from "./HermesAvatar";

export const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

const MS_THRESHOLD = 1e12;
const US_THRESHOLD = 1e14;
const NS_THRESHOLD = 1e17;
const MIN_VALID_EPOCH_MS = 1_577_836_800_000;

function coerceToEpochMs(raw: unknown): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (raw < MS_THRESHOLD) return raw * 1000;
    if (raw < US_THRESHOLD) return raw;
    if (raw < NS_THRESHOLD) return Math.floor(raw / 1000);
    return Math.floor(raw / 1_000_000);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const num = Number(trimmed);
    if (Number.isFinite(num) && num > 0) return coerceToEpochMs(num);
    const parsed = new Date(trimmed).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function isValidEpochMs(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_VALID_EPOCH_MS;
}

function formatBubbleTime(ms: number): string | null {
  try {
    if (Date.now() - ms < 10_000 && Date.now() >= ms) return "just now";
    return formatDistanceToNowStrict(ms, { addSuffix: true });
  } catch {
    return null;
  }
}

function formatBubbleTimeAbsolute(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

type Bubble =
  | Extract<ChatViewItem, { kind: "user" }>
  | Extract<ChatViewItem, { kind: "assistant" }>;

interface MessageRowProps {
  msg: Bubble;
  isLast: boolean;
  isLoading: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  showAvatar?: boolean;
  agent?: AgentAvatarInfo;
  anchorId?: string;
}

export const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  isLoading,
  onApprove,
  onDeny,
  showAvatar = true,
  agent,
  anchorId,
}: MessageRowProps): React.JSX.Element {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isUser = msg.kind === "user";
  const role = isUser ? "user" : "agent";
  const content = msg.content;
  const pending = !!msg.pending;
  const error = !isUser ? msg.error : undefined;
  const isSlashLoader = !isUser && !!msg.isSlashLoader;
  const attachments = msg.attachments;

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [content]);

  const showApprovalBar =
    !isUser &&
    !error &&
    !isLoading &&
    isLast &&
    APPROVAL_RE.test(content);
  const epochMs = coerceToEpochMs(msg.timestamp);
  const isTimeValid = isValidEpochMs(epochMs);
  const bubbleTime = isTimeValid ? formatBubbleTime(epochMs) : null;

  return (
    <div
      id={anchorId}
      data-user-prompt-anchor={isUser ? msg.id : undefined}
      className={`chat-message chat-message-${role}${
        showAvatar ? "" : " chat-message--grouped"
      }`}
    >
      {isUser ? null : !showAvatar ? (
        <AvatarSpacer />
      ) : (
        <HermesAvatar active={isLoading && isLast} agent={agent} />
      )}
      <div
        className={`chat-bubble chat-bubble-${role}${
          error ? " chat-bubble-error" : ""
        }${pending ? " chat-bubble-pending" : ""}`}
      >
        {content && !isLoading && !isSlashLoader && (
          <div className="chat-bubble-actions">
            <button
              type="button"
              className="chat-bubble-copy"
              onClick={() => void handleCopy()}
              title={copied ? t("common.copied") : t("chat.copyMessage")}
              aria-label={copied ? t("common.copied") : t("chat.copyMessage")}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
        {attachments && attachments.length > 0 && (
          <div className="chat-message-attachments">
            {attachments.map((a) => (
              <div key={a.id} className="chat-attachment-chip" title={a.name}>
                {a.name}
              </div>
            ))}
          </div>
        )}
        {isSlashLoader ? (
          <div className="chat-slash-loader">
            <span className="chat-avatar-spinner" />
            <span>{content}</span>
          </div>
        ) : content ? (
          isUser ? (
            content
          ) : (
            <AgentMarkdown>{content}</AgentMarkdown>
          )
        ) : pending ? (
          "…"
        ) : null}
        {error && (
          <div className="chat-error-message" role="alert">
            {error}
          </div>
        )}
      </div>
      {bubbleTime && isTimeValid && (
        <time
          className="chat-bubble-time"
          dateTime={new Date(epochMs).toISOString()}
          title={formatBubbleTimeAbsolute(epochMs)}
        >
          {bubbleTime}
        </time>
      )}
      {showApprovalBar && (
        <div className="chat-approval-bar">
          <button
            type="button"
            className="chat-approval-btn chat-approve"
            onClick={onApprove}
          >
            {t("chat.approve")}
          </button>
          <button
            type="button"
            className="chat-approval-btn chat-deny"
            onClick={onDeny}
          >
            {t("chat.deny")}
          </button>
        </div>
      )}
    </div>
  );
});
