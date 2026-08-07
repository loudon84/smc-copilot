import type {
  HostBridgePageContext,
  HostBridgeResult,
} from "../shared/crm-bridge/host-bridge-contract";

export interface CopilotHostBridgeAPI {
  version: string;
  protocolVersion: "6.0";
  isAvailable(): boolean;
  submit(input: {
    formType: string;
    action: "create" | "edit" | "view" | "analytic";
    callbackUrl?: string;
    skillName?: string;
    pageContext: HostBridgePageContext;
    trigger?: { elementId?: string; label?: string };
  }): Promise<HostBridgeResult>;
  ready(input?: {
    formType?: string;
    action?: string;
    pageContext?: Partial<HostBridgePageContext>;
  }): Promise<HostBridgeResult>;
  emit(event: unknown): Promise<HostBridgeResult>;
  emitReady(event: unknown): Promise<HostBridgeResult>;
}

export interface CopilotHostBridgeSDKAPI extends CopilotHostBridgeAPI {
  onCommand(
    handler: (command: unknown) => Promise<unknown> | unknown,
  ): () => void;
  ack(
    commandId: string,
    result: {
      ok: boolean;
      type: string;
      action?: string;
      message?: string;
      data?: Record<string, unknown>;
      errorCode?: string;
    },
  ): void;
}

declare global {
  interface Window {
    CopilotHostBridge: CopilotHostBridgeAPI;
    CopilotHostBridgeSDK: CopilotHostBridgeSDKAPI;
  }
}

export {};
