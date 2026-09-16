export const KNOWLEDGE_ROUTE_PAGES = [
  "home",
  "bases",
  "sets",
  "documents",
  "uploads",
  "chat",
] as const;

export type KnowledgePageId = (typeof KNOWLEDGE_ROUTE_PAGES)[number];

export type KnowledgeRouteParams = {
  knowledgeBaseId?: string;
  knowledgeSetId?: string;
  documentId?: string;
  sessionId?: string;
};

export type KnowledgeRoute = {
  page: KnowledgePageId;
  params: KnowledgeRouteParams;
};

/** Navigation target for Knowledge page host callbacks (route scope, not URL). */
export type KnowledgeNavigateTarget = {
  page: KnowledgePageId | string;
  params?: KnowledgeRouteParams;
};

export const KNOWLEDGE_HOME_ROUTE: KnowledgeRoute = {
  page: "home",
  params: {},
};

export function isKnowledgePageId(value: string): value is KnowledgePageId {
  return (KNOWLEDGE_ROUTE_PAGES as readonly string[]).includes(value);
}

/** Normalize an untrusted route into a typed Stage page; invalid → home. */
export function resolveKnowledgeRoute(input: {
  page?: string;
  params?: KnowledgeRouteParams;
}): KnowledgeRoute {
  if (!input.page || !isKnowledgePageId(input.page)) {
    return { ...KNOWLEDGE_HOME_ROUTE };
  }
  return {
    page: input.page,
    params: { ...(input.params ?? {}) },
  };
}

export type KnowledgeRouteDescriptor = {
  readonly pages: readonly KnowledgePageId[];
  resolve(input: {
    page?: string;
    params?: KnowledgeRouteParams;
  }): KnowledgeRoute;
};

export const knowledgeRouteDescriptor: KnowledgeRouteDescriptor = {
  pages: KNOWLEDGE_ROUTE_PAGES,
  resolve: resolveKnowledgeRoute,
};
