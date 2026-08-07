import { useContext } from "react";
import { OverlayContext } from "./OverlayProvider";
import type { OverlayContextValue } from "./overlay-types";

const MISSING_PROVIDER_ERROR =
  "useOverlayState must be used within OverlayProvider";

export function useOverlayState(): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error(MISSING_PROVIDER_ERROR);
  }
  return context;
}
