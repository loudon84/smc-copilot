/**
 * PRD v1.4 — Memory Domain is Runtime-owned.
 * Desktop must NOT read Hermes MEMORY.md / USER.md / state.db.
 */
import { getSmcRuntimeClient } from "./copilot-runtime-client/smc-runtime-client";
import { ServeInstanceAdapter } from "./runtime-adapters/ServeInstanceAdapter";

const MEMORY_CHAR_LIMIT = 2200;
const USER_CHAR_LIMIT = 1375;

export interface MemoryEntry {
  index: number;
  content: string;
}

export interface MemoryInfo {
  memory: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    entries: MemoryEntry[];
    charCount: number;
    charLimit: number;
  };
  user: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    charCount: number;
    charLimit: number;
  };
  stats: { totalSessions: number; totalMessages: number };
}

const EMPTY_MEMORY: MemoryInfo = {
  memory: {
    content: "",
    exists: false,
    lastModified: null,
    entries: [],
    charCount: 0,
    charLimit: MEMORY_CHAR_LIMIT,
  },
  user: {
    content: "",
    exists: false,
    lastModified: null,
    charCount: 0,
    charLimit: USER_CHAR_LIMIT,
  },
  stats: { totalSessions: 0, totalMessages: 0 },
};

async function resolveInstanceId(profile?: string): Promise<string> {
  return ServeInstanceAdapter.resolveInstanceId(profile?.trim() || "default");
}

function normalizeMemoryInfo(raw: unknown): MemoryInfo {
  const data = (raw ?? {}) as Partial<MemoryInfo> & Record<string, unknown>;
  const memory = (data.memory ?? {}) as MemoryInfo["memory"];
  const user = (data.user ?? {}) as MemoryInfo["user"];
  const stats = (data.stats ?? {}) as MemoryInfo["stats"];
  return {
    memory: {
      content: String(memory.content ?? ""),
      exists: Boolean(memory.exists),
      lastModified: memory.lastModified ?? null,
      entries: Array.isArray(memory.entries) ? memory.entries : [],
      charCount: Number(memory.charCount ?? String(memory.content ?? "").length),
      charLimit: Number(memory.charLimit ?? MEMORY_CHAR_LIMIT),
    },
    user: {
      content: String(user.content ?? ""),
      exists: Boolean(user.exists),
      lastModified: user.lastModified ?? null,
      charCount: Number(user.charCount ?? String(user.content ?? "").length),
      charLimit: Number(user.charLimit ?? USER_CHAR_LIMIT),
    },
    stats: {
      totalSessions: Number(stats.totalSessions ?? 0),
      totalMessages: Number(stats.totalMessages ?? 0),
    },
  };
}

export async function readMemory(profile?: string): Promise<MemoryInfo> {
  try {
    const instanceId = await resolveInstanceId(profile);
    const data = await getSmcRuntimeClient().memory.get(instanceId);
    return normalizeMemoryInfo(data);
  } catch (err) {
    console.error("[memory] Runtime readMemory failed (no local fallback):", err);
    return EMPTY_MEMORY;
  }
}

/** @deprecated Prefer readMemory — kept for transitional callers. */
export async function readMemoryViaRuntime(instanceId: string): Promise<MemoryInfo | null> {
  try {
    const data = await getSmcRuntimeClient().memory.get(instanceId);
    return normalizeMemoryInfo(data);
  } catch (err) {
    console.error("[memory] readMemoryViaRuntime failed:", err);
    return null;
  }
}

export async function addMemoryEntry(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const instanceId = await resolveInstanceId(profile);
    const result = (await getSmcRuntimeClient().memory.addEntry(instanceId, content.trim())) as {
      success?: boolean;
      error?: string | null;
    };
    return { success: result.success !== false, error: result.error ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateMemoryEntry(
  index: number,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const instanceId = await resolveInstanceId(profile);
    const result = (await getSmcRuntimeClient().memory.updateEntry(
      instanceId,
      index,
      content.trim(),
    )) as { success?: boolean; error?: string | null };
    return { success: result.success !== false, error: result.error ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function removeMemoryEntry(index: number, profile?: string): Promise<boolean> {
  try {
    const instanceId = await resolveInstanceId(profile);
    await getSmcRuntimeClient().memory.deleteEntry(instanceId, index);
    return true;
  } catch (err) {
    console.error("[memory] removeMemoryEntry failed:", err);
    return false;
  }
}

export async function writeMemoryContent(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const instanceId = await resolveInstanceId(profile);
    const result = (await getSmcRuntimeClient().memory.putContent(instanceId, content)) as {
      success?: boolean;
      error?: string | null;
    };
    return { success: result.success !== false, error: result.error ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function writeUserProfile(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const instanceId = await resolveInstanceId(profile);
    const result = (await getSmcRuntimeClient().memory.putUserProfile(instanceId, content)) as {
      success?: boolean;
      error?: string | null;
    };
    return { success: result.success !== false, error: result.error ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
