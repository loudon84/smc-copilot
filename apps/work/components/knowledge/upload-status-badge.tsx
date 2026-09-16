import { Badge } from "@/components/ui/badge";
import type { UploadStatus } from "@/types/upload-job";

const LABEL: Record<UploadStatus, string> = {
  waiting: "等待中",
  uploading: "上传中",
  parsing: "解析中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const VARIANT: Record<
  UploadStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  waiting: "outline",
  uploading: "secondary",
  parsing: "secondary",
  completed: "default",
  failed: "destructive",
  cancelled: "outline",
};

export function UploadStatusBadge({ status }: { status: UploadStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
