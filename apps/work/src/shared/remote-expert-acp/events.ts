export type RemoteExpertPermissionOption = "allow_once" | "reject_once";

export type RemoteExpertSemanticEvent = {
  sessionId?: string;
} & (
  | {
      type: "assistant.delta";
      turnId: string;
      text: string;
    }
  | {
      type: "assistant.message";
      turnId: string;
      text: string;
    }
  | {
      type: "reasoning.delta";
      turnId: string;
      text: string;
    }
  | {
      type: "tool.call";
      turnId: string;
      toolCallId: string;
      toolName: string;
      title?: string;
    }
  | {
      type: "tool.result";
      turnId: string;
      toolCallId: string;
      content?: string;
    }
  | {
      type: "permission.requested";
      turnId: string;
      requestId: string;
      toolCallId?: string;
      toolName?: string;
      title?: string;
      summary?: string;
      options: RemoteExpertPermissionOption[];
    }
  | {
      type: "permission.resolved";
      turnId: string;
      requestId: string;
      optionId: RemoteExpertPermissionOption;
    }
  | {
      type: "artifact.ready";
      turnId: string;
      managedFileId: string;
      name: string;
      uri: string;
    }
  | {
      type: "lifecycle";
      sessionId: string;
      state:
        | "starting"
        | "ready"
        | "running"
        | "waiting_permission"
        | "cancelling"
        | "resume_blocked"
        | "recovery_required"
        | "closed";
      message?: string;
    }
  | {
      type: "turn.end";
      turnId: string;
      outcome: "completed" | "failed" | "cancelled" | "unknown";
      errorCode?: string;
    }
);

export interface RemoteExpertSubmitInput {
  sessionId: string;
  turnId: string;
  profileId: string;
  sessionScope: string;
  text: string;
  fileIds: string[];
  profile: {
    name: string;
    agent_ref: string;
    knowledge_refs?: string[];
    connector_binding_refs?: string[];
    integration_account_refs?: string[];
  };
}

export interface RemoteExpertCancelInput {
  sessionId: string;
}

export interface RemoteExpertCloseInput {
  sessionId: string;
}

export interface RemoteExpertPermissionDecisionInput {
  sessionId: string;
  requestId: string;
  optionId: RemoteExpertPermissionOption;
}

export interface RemoteExpertResumeInput {
  sessionId: string;
  profileId: string;
  sessionScope: string;
}
