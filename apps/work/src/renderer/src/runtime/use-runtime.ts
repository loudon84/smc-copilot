import { useContext } from "react";
import { RuntimeContext, type RuntimeContextValue } from "./runtime-context";

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntime must be used within RuntimeProvider");
  }
  return ctx;
}

/** Soft variant for surfaces that may render outside the provider. */
export function useRuntimeOptional(): RuntimeContextValue | null {
  return useContext(RuntimeContext);
}
