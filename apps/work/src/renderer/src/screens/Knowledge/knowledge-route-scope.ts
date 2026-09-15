import {
  KNOWLEDGE_HOME_ROUTE,
  resolveKnowledgeRoute,
  type KnowledgeRoute,
} from "./knowledge-route-descriptor";

export type KnowledgeRouteSnapshot = {
  routeScopeId: string;
  current: KnowledgeRoute;
  backStack: readonly KnowledgeRoute[];
};

export type KnowledgeRouteScope = {
  readonly routeScopeId: string;
  getSnapshot(): KnowledgeRouteSnapshot;
  subscribe(listener: () => void): () => void;
  push(route: { page: string; params?: KnowledgeRoute["params"] }): void;
  replace(route: { page: string; params?: KnowledgeRoute["params"] }): void;
  back(): void;
  reset(): void;
};

let nextScopeOrdinal = 0;

function cloneRoute(route: KnowledgeRoute): KnowledgeRoute {
  return {
    page: route.page,
    params: { ...route.params },
  };
}

/**
 * Host-instantiated Knowledge route owner.
 * Not a module singleton — each call returns an isolated scope.
 */
export function createKnowledgeRouteScope(options?: {
  routeScopeId?: string;
  initial?: { page: string; params?: KnowledgeRoute["params"] };
}): KnowledgeRouteScope {
  const routeScopeId =
    options?.routeScopeId ?? `knowledge-scope-${++nextScopeOrdinal}`;
  let current = resolveKnowledgeRoute(options?.initial ?? KNOWLEDGE_HOME_ROUTE);
  const backStack: KnowledgeRoute[] = [];
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    routeScopeId,
    getSnapshot(): KnowledgeRouteSnapshot {
      return {
        routeScopeId,
        current: cloneRoute(current),
        backStack: backStack.map(cloneRoute),
      };
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    push(route): void {
      const next = resolveKnowledgeRoute(route);
      backStack.push(cloneRoute(current));
      current = next;
      emit();
    },
    replace(route): void {
      current = resolveKnowledgeRoute(route);
      emit();
    },
    back(): void {
      const previous = backStack.pop();
      if (!previous) return;
      current = previous;
      emit();
    },
    reset(): void {
      backStack.length = 0;
      current = cloneRoute(KNOWLEDGE_HOME_ROUTE);
      emit();
    },
  };
}
