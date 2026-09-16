import type { HermesKnowledgeBasesAPI } from "../../../../../../shared/knowledge/knowledge-base-ipc";
import type { UseKnowledgeFacadeOptions } from "../../../../../../shared/knowledge/use-knowledge-facade";
import { useKnowledgeFacade } from "../../../../../../shared/knowledge/use-knowledge-facade";

export function useKnowledgeBasesApi(
  options: UseKnowledgeFacadeOptions = {},
): ReturnType<typeof useKnowledgeFacade> {
  return useKnowledgeFacade(options);
}

export function readKnowledgeBasesApi(
  override?: HermesKnowledgeBasesAPI | null,
): HermesKnowledgeBasesAPI | null {
  if (override !== undefined && override !== null) return override;
  const hermesAPI = (
    globalThis as unknown as {
      hermesAPI?: { knowledgeJobs?: { bases?: HermesKnowledgeBasesAPI } };
    }
  ).hermesAPI;
  return hermesAPI?.knowledgeJobs?.bases ?? null;
}
