import { vi } from "vitest";

const ABSENT_UNLESS_PROVIDED = new Set([
  "expert",
  "knowledgeJobs",
  "skillRun",
]);

function chatCallable(name: string): (...args: unknown[]) => unknown {
  const impl =
    name === "getModelConfig"
      ? async () => ({ model: "", provider: "auto", baseUrl: "" })
      : name === "listModels" || name === "getSessionMessages"
        ? async () => []
        : name === "getRuntimeProviderState"
          ? async () => ({ state: "UNBOUND", modelIds: [] })
          : name === "getConnectionConfig"
            ? async () => ({ mode: "local", remoteUrl: "" })
            : name === "getFeatureMode"
              ? async () => ({ mode: "off" })
              : async () => undefined;
  return vi.fn(impl);
}

/** Chat shell methods knowledge page tests do not own. Missing calls stay inert. */
export function asChatWindowApi<T extends object>(api: T): T {
  const nested = new WeakMap<object, object>();
  return new Proxy(api, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        if (
          (prop === "skillRun" || prop === "expert") &&
          value &&
          typeof value === "object"
        ) {
          const cached = nested.get(value as object);
          if (cached) return cached;
          const wrapped = asChatWindowApi(value as object);
          nested.set(value as object, wrapped);
          return wrapped;
        }
        return value;
      }
      if (prop.startsWith("on")) return () => () => undefined;
      if (ABSENT_UNLESS_PROVIDED.has(prop)) return undefined;
      return chatCallable(prop);
    },
  });
}

export function installKnowledgeChatDom(): void {
  HTMLElement.prototype.scrollIntoView = () => undefined;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

export function installDesktopAuth(): void {
  (
    window as unknown as {
      desktopAuth: {
        getState: ReturnType<typeof vi.fn>;
        onStateChanged: ReturnType<typeof vi.fn>;
      };
    }
  ).desktopAuth = {
    getState: vi.fn(async () => ({ user: null })),
    onStateChanged: vi.fn(() => () => undefined),
  };
}
