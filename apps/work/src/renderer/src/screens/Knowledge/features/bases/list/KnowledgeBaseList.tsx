import { type ReactElement } from "react";
import type { KnowledgeBaseSnapshot } from "../../../../../../../shared/knowledge/knowledge-base-ipc";

export function KnowledgeBaseCardGrid(props: {
  items: KnowledgeBaseSnapshot[];
  onOpen: (id: string) => void;
}): ReactElement {
  return (
    <div className="knowledge-card-grid" data-testid="knowledge-base-list">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="settings-card knowledge-entity-card"
          data-testid={`knowledge-base-item-${item.id}`}
          onClick={() => props.onOpen(item.id)}
        >
          <div className="settings-card-head">
            <strong>{item.name}</strong>
            <span className="settings-card-badge">{item.visibility}</span>
          </div>
          <p>{item.status}</p>
        </button>
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
    <div className="knowledge-table-wrap">
      <table className="knowledge-table" data-testid="knowledge-base-list">
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid={`knowledge-base-item-${item.id}`}
                  onClick={() => props.onOpen(item.id)}
                >
                  {props.openLabel}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
