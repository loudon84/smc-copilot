export type WorkOutputType =
  | "markdown"
  | "docx"
  | "pdf"
  | "json"
  | "csv"
  | "txt"
  | "folder";

export type WorkOutputSource = "agent" | "tool" | "user" | "remote";

export interface WorkOutputRef {
  id: string;
  name: string;
  type: WorkOutputType;
}

export interface WorkOutput {
  id: string;
  taskId: string;
  name: string;
  type: WorkOutputType;
  source: WorkOutputSource;
  previewable: boolean;
  version: number;
  localPath?: string;
  remoteRef?: string;
  content?: string;
  createdBy: string;
  createdAt: string;
}

export interface WorkOutputPreview {
  outputId: string;
  content: string;
  mimeType?: string;
}

export interface WorkFileChange {
  path: string;
  action: "created" | "modified" | "deleted";
  summary?: string;
}
