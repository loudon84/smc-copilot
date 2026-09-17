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
import type { KnowledgeBaseSnapshot } from "../../src/shared/knowledge/knowledge-base-ipc";

export type KnowledgeBaseCardLabels = {
  status: string;
  visibility: string;
  open: string;
  emptyDescription: string;
  owner: string;
  createdAt: string;
};

type KnowledgeBaseCardProps = {
  knowledgeBase: KnowledgeBaseSnapshot;
  labels: KnowledgeBaseCardLabels;
  onOpen: (id: string) => void;
};

export function KnowledgeBaseCard({
  knowledgeBase,
  labels,
  onOpen,
}: KnowledgeBaseCardProps) {
  return (
    <Card
      className="flex h-full cursor-pointer flex-col shadow-none"
      data-testid={`knowledge-base-item-${knowledgeBase.id}`}
      onClick={() => onOpen(knowledgeBase.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1 text-base">{knowledgeBase.name}</CardTitle>
          <Badge variant="outline">{labels.status}</Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {knowledgeBase.description || labels.emptyDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 text-muted-foreground text-sm">
        <p>{labels.visibility}</p>
        <p data-testid={`knowledge-base-owner-${knowledgeBase.id}`}>
          {labels.owner}: {knowledgeBase.ownerMemberId ?? ""}
        </p>
        {knowledgeBase.createdAt ? (
          <p data-testid={`knowledge-base-created-${knowledgeBase.id}`}>
            {labels.createdAt}: {knowledgeBase.createdAt}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button size="sm" type="button">
          {labels.open}
        </Button>
      </CardFooter>
    </Card>
  );
}
