import { memo, useState } from "react";
import { Brain, ChevronRight, Wrench, Loader2 } from "lucide-react";
import { useI18n } from "@renderer/components/useI18n";
import type { ChatViewItem } from "../../controller/chatViewTypes";
import { HermesAvatar, AvatarSpacer, type AgentAvatarInfo } from "./HermesAvatar";

type ToolCall = Extract<ChatViewItem, { kind: "tool_call" }>;
type ToolResult = Extract<ChatViewItem, { kind: "tool_result" }>;
type ToolItem = ToolCall | ToolResult;
type Reasoning = Extract<ChatViewItem, { kind: "reasoning" }>;

function humanizeToolName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const ReasoningRow = memo(function ReasoningRow({
  msg,
  active = false,
  showAvatar = true,
  agent,
}: {
  msg: Reasoning;
  active?: boolean;
  showAvatar?: boolean;
  agent?: AgentAvatarInfo;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`chat-message chat-message-agent chat-message-history${
        showAvatar ? "" : " chat-message--grouped"
      }`}
    >
      {showAvatar ? (
        <HermesAvatar active={active} agent={agent} />
      ) : (
        <AvatarSpacer />
      )}
      <div
        className={`chat-reasoning-group${
          active ? " chat-reasoning-group--active" : ""
        }`}
      >
        <button
          type="button"
          className="chat-reasoning-group-summary"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {active ? (
            <Loader2 size={16} className="chat-avatar-spinner" />
          ) : (
            <Brain size={13} className="chat-reasoning-group-icon" />
          )}
          <span className="chat-reasoning-group-title">
            {active ? t("chat.thinking") : t("chat.thought")}
          </span>
          <ChevronRight
            size={14}
            className={`chat-reasoning-group-chevron${
              open ? " chat-reasoning-group-chevron--open" : ""
            }`}
          />
        </button>
        <div
          className={`chat-tool-collapse${
            open ? " chat-tool-collapse--open" : ""
          }`}
        >
          <div className="chat-tool-collapse-inner">
            <pre className="chat-history-pre">{msg.content}</pre>
          </div>
        </div>
      </div>
    </div>
  );
});

function isToolCall(msg: ToolItem): msg is ToolCall {
  return msg.kind === "tool_call";
}

function summariseArgs(args: string): string {
  const flat = args.replace(/\s+/g, " ").trim();
  if (flat.length <= 80) return flat;
  return flat.slice(0, 77) + "…";
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

export function toolActivityGroupTitle(items: ToolItem[]): string {
  const toolCallCount = items.filter(isToolCall).length;
  if (toolCallCount > 1) return `${toolCallCount} tools called`;
  const name = items[items.length - 1]?.name;
  return name ? humanizeToolName(name) : "Tool";
}

export function orderToolActivityItems(items: ToolItem[]): ToolItem[] {
  const callIds = new Set(
    items.filter(isToolCall).map((item) => item.callId).filter(Boolean),
  );
  const resultsByCallId = new Map<string, ToolResult[]>();
  for (const item of items) {
    if (isToolCall(item) || !item.callId) continue;
    const bucket = resultsByCallId.get(item.callId) ?? [];
    bucket.push(item);
    resultsByCallId.set(item.callId, bucket);
  }

  const emittedResults = new Set<ToolResult>();
  const ordered: ToolItem[] = [];
  for (const item of items) {
    if (isToolCall(item)) {
      ordered.push(item);
      for (const result of resultsByCallId.get(item.callId) ?? []) {
        ordered.push(result);
        emittedResults.add(result);
      }
      continue;
    }
    if (emittedResults.has(item)) continue;
    if (item.callId && callIds.has(item.callId)) continue;
    ordered.push(item);
    emittedResults.add(item);
  }
  return ordered;
}

function itemDetail(msg: ToolItem): string {
  if (isToolCall(msg)) return summariseArgs(msg.args);
  const lines = countLines(msg.content);
  const base = `${lines} ${lines === 1 ? "line" : "lines"}`;
  const n = msg.attachments?.length ?? 0;
  return n > 0 ? `${base} · ${n} attachment${n === 1 ? "" : "s"}` : base;
}

const ToolActivityItem = memo(function ToolActivityItem({
  msg,
}: {
  msg: ToolItem;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const call = isToolCall(msg);
  const failed = call && msg.status === "failed";

  return (
    <div className="chat-tool-item">
      <button
        type="button"
        className="chat-tool-item-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight
          size={12}
          className={`chat-tool-item-chevron${
            open ? " chat-tool-item-chevron--open" : ""
          }`}
        />
        <Wrench
          size={13}
          className={`chat-tool-item-glyph${
            failed ? " chat-tool-item-glyph--failed" : ""
          }`}
        />
        <span className="chat-tool-item-name">{humanizeToolName(msg.name)}</span>
        <span className="chat-tool-item-detail">{itemDetail(msg)}</span>
      </button>
      <div
        className={`chat-tool-collapse${open ? " chat-tool-collapse--open" : ""}`}
      >
        <div className="chat-tool-collapse-inner">
          <pre
            className={`chat-history-pre ${
              call ? "chat-history-pre--code" : "chat-history-pre--scroll"
            }`}
          >
            {call ? msg.args || "(no arguments)" : msg.content || "(empty)"}
          </pre>
        </div>
      </div>
    </div>
  );
});

export const ToolActivityGroup = memo(function ToolActivityGroup({
  items,
  active = false,
  showAvatar = true,
  agent,
}: {
  items: ToolItem[];
  active?: boolean;
  showAvatar?: boolean;
  agent?: AgentAvatarInfo;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const last = items[items.length - 1];
  const detail = last ? itemDetail(last) : "";
  const title = toolActivityGroupTitle(items);
  const orderedItems = orderToolActivityItems(items);

  return (
    <div
      className={`chat-message chat-message-agent chat-message-history${
        showAvatar ? "" : " chat-message--grouped"
      }`}
    >
      {showAvatar ? (
        <HermesAvatar active={active} agent={agent} />
      ) : (
        <AvatarSpacer />
      )}
      <div className={`chat-tool-group${active ? " chat-tool-group--active" : ""}`}>
        <button
          type="button"
          className="chat-tool-group-summary"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {active ? (
            <Loader2 size={16} className="chat-avatar-spinner" />
          ) : (
            <Wrench size={13} className="chat-tool-group-icon" />
          )}
          <span className="chat-tool-group-name">{title}</span>
          {detail && <span className="chat-tool-group-detail">{detail}</span>}
          <ChevronRight
            size={14}
            className={`chat-tool-group-chevron${
              open ? " chat-tool-group-chevron--open" : ""
            }`}
          />
        </button>
        <div
          className={`chat-tool-collapse${open ? " chat-tool-collapse--open" : ""}`}
        >
          <div className="chat-tool-collapse-inner">
            <div className="chat-tool-group-items">
              {orderedItems.map((it, index) => (
                <ToolActivityItem key={`${it.id}-${index}`} msg={it} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
