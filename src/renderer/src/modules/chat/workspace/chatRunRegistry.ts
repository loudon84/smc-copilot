/**
 * ChatWorkspaceManager — multi-chat run registry (v8.2.1).
 * Tracks concurrent Copilot chats so events stay isolated by runId.
 */

export type ChatRunRegistryEntry = {
  runId: string;
  sessionId: string | null;
  profileId: string;
  expertRunId?: string;
  title: string;
  loading: boolean;
  unread: boolean;
  completed: boolean;
  updatedAt: number;
};

type Listener = () => void;

const registry = new Map<string, ChatRunRegistryEntry>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function upsertChatRun(
  entry: Omit<ChatRunRegistryEntry, "updatedAt"> & { updatedAt?: number },
): ChatRunRegistryEntry {
  const next: ChatRunRegistryEntry = {
    ...entry,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  registry.set(entry.runId, next);
  emit();
  return next;
}

export function patchChatRun(
  runId: string,
  patch: Partial<ChatRunRegistryEntry>,
): ChatRunRegistryEntry | undefined {
  const current = registry.get(runId);
  if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  registry.set(runId, next);
  emit();
  return next;
}

export function getChatRun(runId: string): ChatRunRegistryEntry | undefined {
  return registry.get(runId);
}

export function listChatRuns(): ChatRunRegistryEntry[] {
  return [...registry.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeChatRun(runId: string): void {
  registry.delete(runId);
  emit();
}

export function subscribeChatRuns(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper */
export function __resetChatRunRegistryForTests(): void {
  registry.clear();
}
