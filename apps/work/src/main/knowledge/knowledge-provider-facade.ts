/**
 * Main Knowledge Provider Facade (AC-02 / AC-03 / AC-13).
 * Selects exactly one adapter from current dataMode.
 * Remote adapter is unimplemented — provider mode is fail-closed / unavailable/empty
 * and must never read the mock store.
 */
import type {
  KnowledgeActiveDataMode,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeFacadeGetInput,
  KnowledgeFacadeListInput,
  KnowledgeFacadeMutateInput,
  KnowledgeJobPartition,
  KnowledgeModeSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  createKnowledgeMockAdapter,
  KnowledgeMockAdapter,
} from "./knowledge-mock-adapter";

export type KnowledgeFacadeAdapterKind = "mock" | "remote";

export class KnowledgeFacadeUnavailableError extends Error {
  constructor(message = "KNOWLEDGE_FACADE_UNAVAILABLE") {
    super(message);
    this.name = "KnowledgeFacadeUnavailableError";
  }
}

export class KnowledgeFacadePartitionDeniedError extends Error {
  constructor(message = "KNOWLEDGE_FACADE_PARTITION_DENIED") {
    super(message);
    this.name = "KnowledgeFacadePartitionDeniedError";
  }
}

export interface KnowledgeProviderFacadeDeps {
  getMode: () => KnowledgeModeSnapshot;
  getPartition: () => KnowledgeJobPartition;
  /** Injected for tests; production constructs a Work-owned mock adapter. */
  mockAdapter?: KnowledgeMockAdapter;
}

/**
 * Unimplemented remote adapter placeholder — provider mode never falls back to mock.
 */
class UnimplementedRemoteAdapter {
  list(): KnowledgeFacadeEntitySnapshot[] {
    return [];
  }
  get(): KnowledgeFacadeEntitySnapshot | null {
    return null;
  }
  mutate(): never {
    throw new KnowledgeFacadeUnavailableError();
  }
}

export class KnowledgeProviderFacade {
  private readonly mockAdapter: KnowledgeMockAdapter;
  private readonly remoteAdapter = new UnimplementedRemoteAdapter();
  private readonly deps: KnowledgeProviderFacadeDeps;

  constructor(deps: KnowledgeProviderFacadeDeps) {
    this.deps = deps;
    this.mockAdapter = deps.mockAdapter ?? createKnowledgeMockAdapter();
  }

  activeAdapterKind(): KnowledgeFacadeAdapterKind {
    return this.currentMode() === "mock" ? "mock" : "remote";
  }

  private currentMode(): KnowledgeActiveDataMode {
    return this.deps.getMode().dataMode;
  }

  private actingPartition(): KnowledgeJobPartition {
    return this.deps.getPartition();
  }

  /**
   * Seed synthetic fixtures for the acting partition (mock mode only).
   * Provider mode is a no-op and must not touch the mock store.
   */
  ensureSeeded(): void {
    if (this.currentMode() !== "mock") return;
    this.mockAdapter.ensureSeeded(this.actingPartition());
  }

  listEntities(input: KnowledgeFacadeListInput): KnowledgeFacadeEntitySnapshot[] {
    if (this.currentMode() !== "mock") {
      // Fail-closed: do not read mock store.
      return this.remoteAdapter.list();
    }
    return this.mockAdapter.list(this.actingPartition(), input);
  }

  getEntity(
    input: KnowledgeFacadeGetInput,
  ): KnowledgeFacadeEntitySnapshot | null {
    if (this.currentMode() !== "mock") {
      return this.remoteAdapter.get();
    }
    return this.mockAdapter.get(this.actingPartition(), input);
  }

  mutateEntity(input: KnowledgeFacadeMutateInput): KnowledgeFacadeEntitySnapshot {
    if (this.currentMode() !== "mock") {
      this.remoteAdapter.mutate();
    }
    const result = this.mockAdapter.mutate(this.actingPartition(), input);
    if (!result) {
      throw new KnowledgeFacadePartitionDeniedError();
    }
    return result;
  }
}

export function resetKnowledgeProviderFacadeForTests(): void {
  // Stateless per-instance; tests construct fresh facades.
}
