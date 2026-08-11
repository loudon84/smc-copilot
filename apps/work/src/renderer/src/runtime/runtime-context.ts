import { createContext } from "react";
import type { HermesRuntimeProbe } from "../../../shared/runtime/runtime-contract";
import type { RuntimeReducerState } from "./runtime-reducer";

export interface RuntimeContextValue extends RuntimeReducerState {
  connect: (profile?: string) => Promise<boolean>;
  refresh: (profile?: string) => Promise<void>;
  restart: (profile?: string) => Promise<boolean>;
  validateHome: (path: string) => Promise<boolean>;
  adoptHome: (path: string) => Promise<boolean>;
  lastStatus: HermesRuntimeProbe | null;
}

export const RuntimeContext = createContext<RuntimeContextValue | null>(null);
