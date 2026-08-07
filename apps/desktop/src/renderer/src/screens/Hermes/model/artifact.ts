export type WorkArtifactType =
  | "markdown"
  | "json"
  | "txt"
  | "csv"
  | "docx"
  | "pdf"
  | "file";

export interface WorkArtifact {
  id: string;
  runId: string;
  name: string;
  type: WorkArtifactType;
  mimeType: string;
  size?: number;
  previewable: boolean;
  downloadable: boolean;
  suggestedWorkspacePath?: string;
  createdAt: string;
  previewText?: string;
  source?: string;
}
