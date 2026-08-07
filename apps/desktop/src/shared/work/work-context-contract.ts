export interface WorkContextRef {
  id: string;
  type: "file" | "message" | "web_page" | "skill" | "custom";
  title: string;
  summary?: string;
  ref?: string;
  createdAt: string;
}

export interface WorkWebContextRef {
  id: string;
  type: "web_page";
  title: string;
  url: string;
  snapshotId?: string;
  screenshotId?: string;
  selectedText?: string;
  createdAt: string;
}

export interface WorkAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  ref?: string;
}
