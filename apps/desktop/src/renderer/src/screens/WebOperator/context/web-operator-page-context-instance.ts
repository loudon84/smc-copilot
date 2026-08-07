import { createContext, type Context } from "react";
import type { WebOperatorPageContextValue } from "./web-operator-page-context-types";

/** Stable across Vite HMR — avoids duplicate createContext() instances. */
const GLOBAL_KEY = "__smcWebOperatorPageContext__";

type GlobalWithContext = typeof globalThis & {
  [GLOBAL_KEY]?: Context<WebOperatorPageContextValue | null>;
};

function getContext(): Context<WebOperatorPageContextValue | null> {
  const g = globalThis as GlobalWithContext;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createContext<WebOperatorPageContextValue | null>(null);
  }
  return g[GLOBAL_KEY];
}

export const WebOperatorPageContextReact = getContext();
