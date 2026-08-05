export type ChatSessionMessage = {
  id?: string;
  role: string;
  content: string;
  timestamp?: number;
  kind?: string;
};

/** Port for loading / syncing session history. */
export interface ChatSessionPort {
  getMessages(sessionId: string, profileId?: string): Promise<ChatSessionMessage[]>;
  listSessions?(
    limit?: number,
    offset?: number,
    profileId?: string,
  ): Promise<Array<{ id: string; title?: string; updatedAt?: string }>>;
}
