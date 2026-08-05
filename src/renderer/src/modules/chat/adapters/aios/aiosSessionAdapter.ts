import type {
  ChatSessionPort,
  ChatSessionMessage,
} from "../../ports/ChatSessionPort";

/** AI-OS adapter: hermesAPI session messages → ChatSessionPort */
export const aiosSessionAdapter: ChatSessionPort = {
  async getMessages(sessionId: string): Promise<ChatSessionMessage[]> {
    const items = await window.hermesAPI.getSessionMessages(sessionId);
    return items.map((m) => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
  },
  async listSessions(limit?: number, offset?: number) {
    const items = await window.hermesAPI.listSessions(limit, offset);
    return items.map((s) => ({
      id: s.id,
      title: s.title || undefined,
      updatedAt: s.endedAt ? String(s.endedAt) : String(s.startedAt),
    }));
  },
};
