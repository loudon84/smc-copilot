import { Link } from "@tanstack/react-router";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { KnowledgeCitation } from "@/types/knowledge-chat";

export function CitationCard({ citation }: { citation: KnowledgeCitation }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-1 p-4 pb-2">
        <CardTitle className="flex items-start gap-2 font-medium text-sm">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2">{citation.documentName}</span>
        </CardTitle>
        <CardDescription className="text-xs">
          {citation.knowledgeBaseName}
          {citation.page == null ? "" : ` · 第 ${citation.page} 页`}
          {` · 相似度 ${(citation.score * 100).toFixed(0)}%`}
          {` · v${citation.version}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <p className="line-clamp-4 text-muted-foreground text-xs leading-relaxed">
          {citation.chunkText}
        </p>
        <Button asChild className="h-7 text-xs" size="sm" variant="outline">
          <Link
            params={{ documentId: citation.documentId }}
            to="/documents/$documentId"
          >
            查看原文
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
