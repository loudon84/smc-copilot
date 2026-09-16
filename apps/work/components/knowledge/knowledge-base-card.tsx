import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KnowledgeBase } from "@/types/knowledge-base";

const STATUS_LABEL: Record<KnowledgeBase["status"], string> = {
  active: "启用",
  disabled: "停用",
  syncing: "同步中",
  error: "异常",
};

const VISIBILITY_LABEL: Record<KnowledgeBase["visibility"], string> = {
  private: "私有",
  department: "部门可见",
  organization: "组织可见",
};

type KnowledgeBaseCardProps = {
  knowledgeBase: KnowledgeBase;
  onEdit?: (kb: KnowledgeBase) => void;
  onDelete?: (kb: KnowledgeBase) => void;
};

export function KnowledgeBaseCard({
  knowledgeBase,
  onEdit,
  onDelete,
}: KnowledgeBaseCardProps) {
  return (
    <Card className="flex h-full flex-col shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1 text-base">
            {knowledgeBase.icon ? `${knowledgeBase.icon} ` : ""}
            {knowledgeBase.name}
          </CardTitle>
          <Badge variant="outline">{STATUS_LABEL[knowledgeBase.status]}</Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {knowledgeBase.description || "暂无描述"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-muted-foreground text-sm">
        <p>
          {knowledgeBase.documentCount.toLocaleString()} 个文档 ·{" "}
          {knowledgeBase.chunkCount.toLocaleString()} 个分块 ·{" "}
          {VISIBILITY_LABEL[knowledgeBase.visibility]}
        </p>
        <p>
          所有者：{knowledgeBase.owner.displayName} · 更新于{" "}
          {new Date(knowledgeBase.updatedAt).toLocaleString("zh-CN")}
        </p>
        {knowledgeBase.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {knowledgeBase.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button asChild size="sm">
          <Link
            params={{ knowledgeBaseId: knowledgeBase.id }}
            to="/knowledge-bases/$knowledgeBaseId"
          >
            进入
          </Link>
        </Button>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8" size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(knowledgeBase)}>
                  编辑
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(knowledgeBase)}
                >
                  删除
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardFooter>
    </Card>
  );
}
