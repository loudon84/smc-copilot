import type {
  ChatSessionPort,
  ChatSessionMessage,
} from "../../ports/ChatSessionPort";

/** AI-OS adapter: Runtime Sessions API → ChatSessionPort (PRD v1.6 FR-09). */
export const aiosSessionAdapter: ChatSessionPort = {
  async getMessages(sessionId: string): Promise<ChatSessionMessage[]> {
    if (typeof window.copilotRuntime?.listSessionMessages === "function") {
      const items = (await window.copilotRuntime.listSessionMessages(sessionId)) as Array<{
        id?: string | number;
        role?: string;
        content?: string;
        timestamp?: number | string;
        created_at?: number | string;
      }>;
      return (items || []).map((m) => ({
        id: String(m.id ?? ""),
        role: String(m.role ?? "assistant"),
        content: String(m.content ?? ""),
        timestamp:
          typeof m.timestamp === "number"
            ? m.timestamp
            : typeof m.created_at === "number"
              ? m.created_at
              : undefined,
      }));
    }
    // Legacy fallback only when Serve Runtime is not preferred.
    const items = await window.hermesAPI.getSessionMessages(sessionId);
    return items.map((m) => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
  },
  async listSessions(limit?: number, offset?: number) {
    if (typeof window.copilotRuntime?.listSessions === "function") {
      const items = (await window.copilotRuntime.listSessions()) as Array<{
        id?: string;
        sessionId?: string;
        title?: string;
        updated_at?: string | number;
        updatedAt?: string | number;
        endedAt?: string | number;
        created_at?: string | number;
        startedAt?: string | number;
      }>;
      const sliced = (items || []).slice(offset ?? 0, (offset ?? 0) + (limit ?? 50));
      return sliced.map((s) => ({
        id: String(s.id ?? s.sessionId ?? ""),
        title: s.title || undefined,
        updatedAt: String(
          s.updatedAt ?? s.updated_at ?? s.endedAt ?? s.startedAt ?? s.created_at ?? "",
        ),
      }));
    }
    const items = await window.hermesAPI.listSessions(limit, offset);
    return items.map((s) => ({
      id: s.id,
      title: s.title || undefined,
      updatedAt: s.endedAt ? String(s.endedAt) : String(s.startedAt),
    }));
  },
};
