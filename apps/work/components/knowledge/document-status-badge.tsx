import { Badge } from "@/components/ui/badge";
import type { ParseStatus } from "@/types/knowledge-document";

const LABEL: Record<ParseStatus, string> = {
  pending: "待处理",
  parsing: "解析中",
  completed: "已完成",
  failed: "失败",
};

const VARIANT: Record<
  ParseStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  parsing: "secondary",
  completed: "default",
  failed: "destructive",
};

export function DocumentStatusBadge({ status }: { status: ParseStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
