import type { Attachment } from "./attachments";
import type { ExpertRunContinuationItem } from "./expert";

export type DesktopSessionContinuationItem =
  | {
      kind: "user";
      content: string;
      attachments?: Attachment[];
    }
  | {
      kind: "assistant";
      content: string;
      error?: string;
      attachments?: Attachment[];
    }
  | {
      kind: "reasoning";
      text: string;
    }
  | {
      kind: "tool_call";
      callId: string;
      name: string;
      args: string;
    }
  | {
      kind: "tool_result";
      callId: string;
      name: string;
      content: string;
      attachments?: Attachment[];
    }
  | ExpertRunContinuationItem;

export interface DesktopSessionLocalError {
  error: string;
  userContent: string;
}

export type { ExpertRunContinuationItem };
