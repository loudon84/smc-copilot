/** v8.1 — ChatRunContextPort for Edit-and-Retry work context restore. */

export type ChatRunContextSnapshot = {
  expertId?: string;
  teamId?: string;
  skillName?: string;
  workMode?: string;
  permissionMode?: string;
  promptHintMode?: "auto" | "custom" | "disabled";
  modelId?: string | null;
};

export interface ChatRunContextPort {
  getContext(runId: string): ChatRunContextSnapshot;
  restoreContext(
    runId: string,
    context: ChatRunContextSnapshot,
  ): Promise<void>;
}
