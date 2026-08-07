import type {
  ShellViewBounds,
  ShellViewKind,
  ShellViewLayer,
  ShellViewOptions,
  ShellViewState,
} from "./view-contract";

export const ShellViewChannels = {
  CREATE: "shell:view:create",
  ACTIVATE: "shell:view:activate",
  SET_BOUNDS: "shell:view:set-bounds",
  LOAD_URL: "shell:view:load-url",
  FOCUS: "shell:view:focus",
  HIDE: "shell:view:hide",
  DESTROY: "shell:view:destroy",
  GET_STATE: "shell:view:get-state",
  GET_ALL: "shell:view:get-all",
  RELOAD: "shell:view:reload",
  STOP_LOADING: "shell:view:stop-loading",
  GO_BACK: "shell:view:go-back",
  GO_FORWARD: "shell:view:go-forward",
  RECOVER: "shell:view:recover",
} as const;

export const ShellViewEvents = {
  METADATA_CHANGED: "shell:view:metadata-changed",
  LOAD_FAILED: "shell:view:load-failed",
  CRASHED: "shell:view:crashed",
} as const;

export type ShellViewBoundsIPC = ShellViewBounds;

export interface ShellViewCreateRequest {
  layerId: string;
  kind: ShellViewKind;
  url: string;
  options?: Partial<ShellViewOptions>;
}

export interface ShellViewActivateRequest {
  layerId: string;
}

export interface ShellViewSetBoundsRequest {
  layerId: string;
  bounds: ShellViewBoundsIPC;
}

export interface ShellViewLoadUrlRequest {
  layerId: string;
  url: string;
}

export interface ShellViewFocusRequest {
  layerId: string;
}

export interface ShellViewHideRequest {
  layerId: string;
}

export interface ShellViewDestroyRequest {
  layerId: string;
}

export interface ShellViewMetadata {
  id: string;
  kind: ShellViewKind;
  layer: ShellViewLayer;
  state: ShellViewState;
  active: boolean;

  url: string;
  title: string;
  favicon?: string;

  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;

  bounds: ShellViewBounds;

  errorCode?: number;
  errorDescription?: string;

  crashed?: boolean;
  crashedReason?: string;
  crashedExitCode?: number;

  updatedAt: number;
}

export type ShellViewSnapshot = ShellViewMetadata;

export interface ShellViewMetadataChangedEvent {
  snapshot: ShellViewSnapshot;
}

export interface ShellViewLoadFailedEvent {
  id: string;
  url: string;
  errorCode: number;
  errorDescription: string;
}

export interface ShellViewCrashedEvent {
  id: string;
  reason: string;
  exitCode: number;
}

export type ShellViewResponse = void;
