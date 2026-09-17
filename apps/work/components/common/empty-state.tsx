import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title?: string;
  description?: string;
  testId?: string;
};

export function EmptyState({
  title = "Nothing here yet",
  description = "No content is available.",
  testId,
}: EmptyStateProps) {
  return (
    <div
      className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground"
      data-testid={testId}
    >
      <Inbox className="h-10 w-10" />
      <p className="font-medium">{title}</p>
      {description ? <p className="text-sm">{description}</p> : null}
    </div>
  );
}
