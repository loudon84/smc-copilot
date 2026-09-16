import { Badge } from "@/components/ui/badge";
import type { PermissionRole } from "@/types/permission";

const VARIANT: Record<
  PermissionRole,
  "default" | "secondary" | "outline" | "destructive"
> = {
  Owner: "default",
  Manager: "secondary",
  Editor: "outline",
  Viewer: "outline",
};

export function PermissionBadge({ role }: { role: PermissionRole }) {
  return <Badge variant={VARIANT[role]}>{role}</Badge>;
}
