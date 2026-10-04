import type {
  RemoteExpertAvailability,
  RemoteExpertBindingSnapshot,
  RemoteExpertCatalogList,
} from "./contract";
import type {
  RemoteExpertCancelInput,
  RemoteExpertCloseInput,
  RemoteExpertPermissionDecisionInput,
  RemoteExpertResumeInput,
  RemoteExpertSemanticEvent,
  RemoteExpertSubmitInput,
} from "./events";

export const REMOTE_EXPERT_IPC_CHANNELS = {
  GET_AVAILABILITY: "remote-expert:get-availability",
  LIST_CATALOG: "remote-expert:list-catalog",
  GET_BINDING: "remote-expert:get-binding",
  SUBMIT: "remote-expert:submit",
  CANCEL: "remote-expert:cancel",
  CLOSE: "remote-expert:close",
  RESUME: "remote-expert:resume",
  DECIDE_PERMISSION: "remote-expert:decide-permission",
  ON_EVENT: "remote-expert:on-event",
} as const;

export type RemoteExpertIpcChannel =
  (typeof REMOTE_EXPERT_IPC_CHANNELS)[keyof typeof REMOTE_EXPERT_IPC_CHANNELS];

export interface RemoteExpertApi {
  getAvailability(): Promise<RemoteExpertAvailability>;
  listCatalog(): Promise<RemoteExpertCatalogList>;
  getBinding(sessionId: string): Promise<RemoteExpertBindingSnapshot | null>;
  submit(input: RemoteExpertSubmitInput): Promise<{ turnId: string }>;
  cancel(input: RemoteExpertCancelInput): Promise<void>;
  close(input: RemoteExpertCloseInput): Promise<void>;
  resume(input: RemoteExpertResumeInput): Promise<RemoteExpertBindingSnapshot>;
  decidePermission(input: RemoteExpertPermissionDecisionInput): Promise<void>;
  onEvent(listener: (event: RemoteExpertSemanticEvent) => void): () => void;
}
