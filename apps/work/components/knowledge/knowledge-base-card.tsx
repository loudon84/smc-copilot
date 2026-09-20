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
import { cn } from "@/utils/tailwind";
import { PROFILE_COLORS } from "../../src/shared/profileColors";
import type { KnowledgeBaseSnapshot } from "../../src/shared/knowledge/knowledge-base-ipc";

/** Palette blue — usable / ready-to-open CTA. */
const USABLE_OPEN_COLOR = PROFILE_COLORS[0]; // #3498DB

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

function isUsableBase(status: KnowledgeBaseSnapshot["status"]): boolean {
  return status === "active";
}

export function KnowledgeBaseCard({
  knowledgeBase,
  labels,
  onOpen,
}: KnowledgeBaseCardProps) {
  const usable = isUsableBase(knowledgeBase.status);

  return (
    <Card
      className={cn(
        "flex h-full cursor-pointer flex-col shadow-none",
        // ~70% of previous card footprint (tighter padding / type).
        "!gap-1 !p-2",
      )}
      data-testid={`knowledge-base-item-${knowledgeBase.id}`}
      data-usable={usable ? "true" : "false"}
      onClick={() => onOpen(knowledgeBase.id)}
    >
      <CardHeader className="!gap-1 !p-0 pb-1">
        <div className="flex items-start justify-between gap-1.5">
          <CardTitle className="line-clamp-1 text-sm leading-snug">
            {knowledgeBase.name}
          </CardTitle>
          <Badge variant="outline" className="shrink-0 text-[0.625rem]">
            {labels.status}
          </Badge>
        </div>
        <CardDescription className="line-clamp-1 text-xs">
          {knowledgeBase.description || labels.emptyDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="!flex-1 !gap-0.5 !p-0 text-[0.6875rem] leading-snug text-muted-foreground">
        <p className="truncate">{labels.visibility}</p>
        <p
          className="truncate"
          data-testid={`knowledge-base-owner-${knowledgeBase.id}`}
        >
          {labels.owner}: {knowledgeBase.ownerMemberId ?? ""}
        </p>
        {knowledgeBase.createdAt ? (
          <p
            className="truncate"
            data-testid={`knowledge-base-created-${knowledgeBase.id}`}
          >
            {labels.createdAt}: {knowledgeBase.createdAt}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="!mt-1 !p-0 !pt-1">
        <Button
          size="sm"
          type="button"
          className={cn(
            "h-7 min-h-7 px-2.5 text-xs",
            usable && "border-transparent text-white hover:opacity-90",
          )}
          style={
            usable
              ? {
                  backgroundColor: USABLE_OPEN_COLOR,
                  borderColor: "transparent",
                  color: "#fff",
                }
              : undefined
          }
          data-testid={`knowledge-base-open-${knowledgeBase.id}`}
        >
          {labels.open}
        </Button>
      </CardFooter>
    </Card>
  );
}
