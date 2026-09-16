import { type ReactElement } from "react";
import { KnowledgePages } from "../../../../src/renderer/src/screens/Knowledge/KnowledgePages";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseSnapshot,
} from "../../../../src/shared/knowledge/knowledge-base-ipc";

const VISIBILITIES: KnowledgeBaseSnapshot["visibility"][] = [
  "private",
  "department",
  "organization",
  "private",
  "organization",
  "department",
  "private",
  "organization",
];

const BASES: KnowledgeBaseSnapshot[] = Array.from({ length: 8 }, (_, index) => ({
  id: `kb-${String(index + 1).padStart(2, "0")}`,
  name: `Knowledge Base ${index + 1}`,
  description:
    index === 0
      ? "Fixture detail content for the Knowledge visual gate."
      : null,
  status: "active",
  visibility: VISIBILITIES[index] ?? "private",
}));

const DETAIL_FILES: KnowledgeBaseFileSnapshot[] = [
  {
    id: "file-handbook",
    knowledgeBaseId: "kb-01",
    fileName: "onboarding-handbook.pdf",
    status: "active",
    mimeType: "application/pdf",
  },
  {
    id: "file-policy",
    knowledgeBaseId: "kb-01",
    fileName: "policy-notes.md",
    status: "active",
    mimeType: "text/markdown",
  },
  {
    id: "file-faq",
    knowledgeBaseId: "kb-01",
    fileName: "support-faq.txt",
    status: "updating",
    mimeType: "text/plain",
  },
];

function createBasesApi(): HermesKnowledgeBasesAPI {
  return {
    list: async () => ({
      items: BASES,
      total: BASES.length,
      page: 1,
      pageSize: 50,
    }),
    get: async ({ knowledgeBaseId }) => {
      const found = BASES.find((item) => item.id === knowledgeBaseId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      return found;
    },
    create: async () => {
      throw new Error("KNOWLEDGE_UNAVAILABLE");
    },
    update: async () => {
      throw new Error("KNOWLEDGE_UNAVAILABLE");
    },
    delete: async () => undefined,
    listFiles: async ({ knowledgeBaseId }) => {
      const items =
        knowledgeBaseId === "kb-01" ? DETAIL_FILES : [];
      return {
        items,
        total: items.length,
        page: 1,
        pageSize: 50,
      };
    },
  };
}

export function KnowledgeUiVisualApp(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const scene = params.get("scene") === "base-detail" ? "base-detail" : "bases-card";
  const bases = createBasesApi();

  return (
    <div className="knowledge-visual-root" data-testid="knowledge-ui-visual-root">
      <KnowledgePages
        page="bases"
        params={scene === "base-detail" ? { knowledgeBaseId: "kb-01" } : {}}
        capability={{ available: true, status: "available" }}
        mode={{
          dataMode: "provider",
          allowSyntheticData: false,
          configSource: "default",
        }}
        bases={bases}
      />
    </div>
  );
}
