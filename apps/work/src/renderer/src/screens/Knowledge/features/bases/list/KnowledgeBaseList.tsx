import { type ReactElement } from "react";
import { KnowledgeBaseCard } from "@/components/knowledge/knowledge-base-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  KnowledgeBaseSnapshot,
  KnowledgeBaseStatus,
  KnowledgeBaseVisibility,
} from "../../../../../../../shared/knowledge/knowledge-base-ipc";

export function KnowledgeBaseCardGrid(props: {
  items: KnowledgeBaseSnapshot[];
  onOpen: (id: string) => void;
  statusLabel: (status: KnowledgeBaseStatus) => string;
  visibilityLabel: (visibility: KnowledgeBaseVisibility) => string;
  openLabel: string;
  emptyDescription: string;
  ownerLabel: string;
  createdAtLabel: string;
}): ReactElement {
  return (
    <div
      className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3 min-[760px]:grid-cols-4 min-[1000px]:grid-cols-5 min-[1240px]:grid-cols-6 min-[1480px]:grid-cols-7"
      data-testid="knowledge-base-list"
    >
      {props.items.map((item) => (
        <KnowledgeBaseCard
          key={item.id}
          knowledgeBase={item}
          onOpen={props.onOpen}
          labels={{
            status: props.statusLabel(item.status),
            visibility: props.visibilityLabel(item.visibility),
            open: props.openLabel,
            emptyDescription: props.emptyDescription,
            owner: props.ownerLabel,
            createdAt: props.createdAtLabel,
          }}
        />
      ))}
    </div>
  );
}

export function KnowledgeBaseTable(props: {
  items: KnowledgeBaseSnapshot[];
  onOpen: (id: string) => void;
  openLabel: string;
  nameLabel: string;
  visibilityLabel: string;
  visibilityValue: (visibility: KnowledgeBaseVisibility) => string;
}): ReactElement {
  return (
    <div className="overflow-x-hidden">
      <Table className="w-full" data-testid="knowledge-base-list">
        <TableHeader>
          <TableRow>
            <TableHead>{props.nameLabel}</TableHead>
            <TableHead>{props.visibilityLabel}</TableHead>
            <TableHead>{props.openLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.name}</TableCell>
              <TableCell>{props.visibilityValue(item.visibility)}</TableCell>
              <TableCell>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`knowledge-base-item-${item.id}`}
                  onClick={() => props.onOpen(item.id)}
                >
                  {props.openLabel}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
