import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/common/data-table";
import { DocumentStatusBadge } from "@/components/knowledge/document-status-badge";
import { Button } from "@/components/ui/button";
import type { KnowledgeDocument } from "@/types/knowledge-document";

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VISIBILITY_LABEL: Record<KnowledgeDocument["visibility"], string> = {
  private: "私有",
  department: "部门",
  organization: "组织",
  custom: "指定人员",
};

type DocumentTableProps = {
  documents: KnowledgeDocument[];
  knowledgeBaseNameById?: Record<string, string>;
  showKnowledgeBase?: boolean;
};

export function DocumentTable({
  documents,
  knowledgeBaseNameById = {},
  showKnowledgeBase = false,
}: DocumentTableProps) {
  const columns: ColumnDef<KnowledgeDocument>[] = [
    {
      accessorKey: "name",
      header: "文档名称",
      cell: ({ row }) => (
        <Link
          className="font-medium text-primary hover:underline"
          params={{ documentId: row.original.id }}
          to="/documents/$documentId"
        >
          {row.original.name}
        </Link>
      ),
    },
    ...(showKnowledgeBase
      ? [
          {
            id: "knowledgeBase",
            header: "所属知识库",
            cell: ({ row }) =>
              knowledgeBaseNameById[row.original.knowledgeBaseId] ??
              row.original.knowledgeBaseId,
          } satisfies ColumnDef<KnowledgeDocument>,
        ]
      : []),
    {
      accessorKey: "extension",
      header: "类型",
      cell: ({ row }) => row.original.extension.toUpperCase(),
    },
    {
      accessorKey: "size",
      header: "大小",
      cell: ({ row }) => formatSize(row.original.size),
    },
    {
      accessorKey: "currentVersion",
      header: "版本",
      cell: ({ row }) => `v${row.original.currentVersion}`,
    },
    {
      accessorKey: "parseStatus",
      header: "解析状态",
      cell: ({ row }) => (
        <DocumentStatusBadge status={row.original.parseStatus} />
      ),
    },
    {
      accessorKey: "visibility",
      header: "可见范围",
      cell: ({ row }) => VISIBILITY_LABEL[row.original.visibility],
    },
    {
      accessorKey: "updatedBy",
      header: "更新人",
      cell: ({ row }) => row.original.updatedBy.displayName,
    },
    {
      accessorKey: "updatedAt",
      header: "更新时间",
      cell: ({ row }) =>
        new Date(row.original.updatedAt).toLocaleString("zh-CN"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button asChild size="sm" variant="ghost">
          <Link
            params={{ documentId: row.original.id }}
            to="/documents/$documentId"
          >
            详情
          </Link>
        </Button>
      ),
    },
  ];

  return <DataTable columns={columns} data={documents} />;
}
