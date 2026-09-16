import { type ReactElement } from "react";
import type { KnowledgeBaseSnapshot } from "../../../../../../../shared/knowledge/knowledge-base-ipc";
import { StatusBadge } from "../../../../../components/common/StatusBadge";
import { Button } from "../../../../../components/ui/Button";
import { Card, CardHead, CardTitle } from "../../../../../components/ui/Card";
import { Table } from "../../../../../components/ui/Table";

export function KnowledgeBaseCardGrid(props: {
  items: KnowledgeBaseSnapshot[];
  onOpen: (id: string) => void;
}): ReactElement {
  return (
    <div className="knowledge-card-grid" data-testid="knowledge-base-list">
      {props.items.map((item) => (
        <Card
          key={item.id}
          as="button"
          type="button"
          className="knowledge-entity-card"
          data-testid={`knowledge-base-item-${item.id}`}
          onClick={() => props.onOpen(item.id)}
        >
          <CardHead>
            <CardTitle>{item.name}</CardTitle>
            <StatusBadge>{item.visibility}</StatusBadge>
          </CardHead>
          <p>{item.status}</p>
        </Card>
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
}): ReactElement {
  return (
    <Table data-testid="knowledge-base-list">
      <thead>
        <tr>
          <th>{props.nameLabel}</th>
          <th>{props.visibilityLabel}</th>
          <th>{props.openLabel}</th>
        </tr>
      </thead>
      <tbody>
        {props.items.map((item) => (
          <tr key={item.id}>
            <td>{item.name}</td>
            <td>{item.visibility}</td>
            <td>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`knowledge-base-item-${item.id}`}
                onClick={() => props.onOpen(item.id)}
              >
                {props.openLabel}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
