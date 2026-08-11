import type {
  HermesRuntimeProbe,
  HermesRuntimeState,
} from "../../../shared/runtime/runtime-contract";

export type RuntimeAction =
  | { type: "CONNECT_START" }
  | { type: "CONNECT_SUCCESS"; status: HermesRuntimeProbe }
  | { type: "CONNECT_FAILURE"; status: HermesRuntimeProbe | null; error: string }
  | { type: "STATUS"; status: HermesRuntimeProbe }
  | { type: "RESET" };

export interface RuntimeReducerState {
  state: HermesRuntimeState;
  status: HermesRuntimeProbe | null;
  connecting: boolean;
  ready: boolean;
  error: string | null;
}

export const initialRuntimeState: RuntimeReducerState = {
  state: "gateway_stopped",
  status: null,
  connecting: false,
  ready: false,
  error: null,
};

export function runtimeReducer(
  state: RuntimeReducerState,
  action: RuntimeAction,
): RuntimeReducerState {
  switch (action.type) {
    case "CONNECT_START":
      return {
        ...state,
        connecting: true,
        error: null,
        state: "gateway_starting",
      };
    case "CONNECT_SUCCESS":
      return {
        state: "ready",
        status: action.status,
        connecting: false,
        ready: true,
        error: null,
      };
    case "CONNECT_FAILURE":
      return {
        state: action.status?.state ?? "runtime_missing",
        status: action.status,
        connecting: false,
        ready: false,
        error: action.error,
      };
    case "STATUS":
      return {
        ...state,
        state: action.status.state,
        status: action.status,
        ready: action.status.state === "ready",
        error:
          action.status.state === "ready"
            ? null
            : (action.status.errorMessage ?? state.error),
      };
    case "RESET":
      return initialRuntimeState;
    default:
      return state;
  }
}
