import { Link } from "@tanstack/react-router";
import { MessageSquare, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { KnowledgeBase } from "@/types/knowledge-base";
import type { KnowledgeSet } from "@/types/knowledge-set";

const VISIBILITY_LABEL: Record<KnowledgeSet["visibility"], string> = {
  private: "私有",
  department: "部门可见",
  organization: "组织可见",
};

type KnowledgeSetCardProps = {
  knowledgeSet: KnowledgeSet;
  knowledgeBases?: KnowledgeBase[];
  onEdit?: (ks: KnowledgeSet) => void;
};

export function KnowledgeSetCard({
  knowledgeSet,
  knowledgeBases = [],
  onEdit,
}: KnowledgeSetCardProps) {
  const boundNames = knowledgeSet.knowledgeBaseIds
    .map((id) => knowledgeBases.find((kb) => kb.id === id)?.name ?? id)
    .slice(0, 3);

  return (
    <Card className="flex h-full flex-col shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1 text-base">
            {knowledgeSet.name}
          </CardTitle>
          <Badge variant="outline">
            {VISIBILITY_LABEL[knowledgeSet.visibility]}
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {knowledgeSet.description || "暂无描述"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-muted-foreground text-sm">
        {boundNames.length > 0 && (
          <p className="line-clamp-2">包含：{boundNames.join("、")}</p>
        )}
        <p>
          {knowledgeSet.knowledgeBaseIds.length} 个知识库 ·{" "}
          {knowledgeSet.documentCount.toLocaleString()} 个文档
        </p>
        <p>
          创建人：{knowledgeSet.createdBy.displayName} · 更新于{" "}
          {new Date(knowledgeSet.updatedAt).toLocaleString("zh-CN")}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link to="/chat">
            <MessageSquare className="mr-1 h-3.5 w-3.5" />
            开始问答
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link
            params={{ knowledgeSetId: knowledgeSet.id }}
            to="/knowledge-sets/$knowledgeSetId"
          >
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            管理
          </Link>
        </Button>
        {onEdit && (
          <Button
            onClick={() => onEdit(knowledgeSet)}
            size="sm"
            variant="ghost"
          >
            编辑
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
