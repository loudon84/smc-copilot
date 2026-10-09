import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { DesktopAuthState } from "../../../../shared/auth/auth-contract";
import type { KnowledgeModeSnapshot } from "../../../../shared/knowledge/knowledge-job-ipc";
import {
  createKnowledgeRouteScope,
  type KnowledgeRouteScope,
  type KnowledgeRouteSnapshot,
} from "./knowledge-route-scope";
import { KnowledgePages } from "./KnowledgePages";
import type {
  KnowledgeNavigateTarget,
  KnowledgeRouteParams,
} from "./knowledge-route-descriptor";

export type KnowledgeUiEffectCounters = {
  pollingTicks: number;
  rafTicks: number;
  shortcutCalls: number;
};

export type KnowledgeViewProps = {
  active: boolean;
  /** Layout active Hermes profile — threaded into Knowledge Chat (G5). */
  profile?: string;
  /** Optional injected scope for tests; product uses one default host scope. */
  scope?: KnowledgeRouteScope;
  /** Optional observability counters for hidden-effect proofs (V02). */
  uiEffectCounters?: KnowledgeUiEffectCounters;
};

const EMPTY_AUTH: DesktopAuthState = {
  authenticated: false,
  endpointConfig: null,
  user: null,
  expiresAt: null,
};

function readModeApi():
  | NonNullable<Window["hermesAPI"]>["knowledgeJobs"]
  | undefined {
  return window.hermesAPI?.knowledgeJobs;
}

/**
 * Knowledge module root for Work Layout keep-alive.
 * Stays mounted while hidden; UI-only polling/rAF/shortcuts run only when active.
 * Mock/Demo badge is presentation of Main-owned mode — Renderer cannot hide it.
 */
export function KnowledgeView({
  active,
  profile = "default",
  scope: injectedScope,
  uiEffectCounters,
}: KnowledgeViewProps): ReactElement {
  const defaultScopeRef = useRef<KnowledgeRouteScope | null>(null);
  if (!injectedScope && !defaultScopeRef.current) {
    defaultScopeRef.current = createKnowledgeRouteScope();
  }
  const scope = injectedScope ?? defaultScopeRef.current!;

  const [snapshot, setSnapshot] = useState<KnowledgeRouteSnapshot>(() =>
    scope.getSnapshot(),
  );
  const [authState, setAuthState] = useState<DesktopAuthState>(EMPTY_AUTH);
  const [authReady, setAuthReady] = useState(() => !window.desktopAuth);
  const [mode, setMode] = useState<KnowledgeModeSnapshot | null>(null);
  const countersRef = useRef(uiEffectCounters);
  countersRef.current = uiEffectCounters;

  useEffect(() => {
    setSnapshot(scope.getSnapshot());
    return scope.subscribe(() => {
      setSnapshot(scope.getSnapshot());
    });
  }, [scope]);

  useEffect(() => {
    const api = window.desktopAuth;
    if (!api) return;

    let cancelled = false;
    let receivedEvent = false;
    const apply = (state: DesktopAuthState): void => {
      if (cancelled) return;
      setAuthState({
        authenticated: state.authenticated,
        endpointConfig: state.endpointConfig,
        user: state.user,
        expiresAt: state.expiresAt,
      });
      setAuthReady(true);
    };

    const unsubscribe = api.onStateChanged((state) => {
      receivedEvent = true;
      apply(state);
    });
    void api
      .getState()
      .then((state) => {
        if (!receivedEvent) apply(state);
      })
      .catch(() => {
        if (!receivedEvent) apply(EMPTY_AUTH);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const api = readModeApi();
    const getMode = api && "getMode" in api ? api.getMode : undefined;
    if (!getMode) {
      setMode({
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      });
      return;
    }

    let cancelled = false;
    void getMode()
      .then((snap) => {
        if (!cancelled) setMode(snap);
      })
      .catch(() => {
        if (!cancelled) {
          setMode({
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    const pollId = window.setInterval(() => {
      const counters = countersRef.current;
      if (counters) counters.pollingTicks += 1;
    }, 1000);

    let rafId = 0;
    const tick = (): void => {
      const counters = countersRef.current;
      if (counters) counters.rafTicks += 1;
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return;
      }
      const counters = countersRef.current;
      if (counters) counters.shortcutCalls += 1;
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearInterval(pollId);
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  const identityUser = authState.authenticated ? authState.user : null;
  const authSubject = identityUser?.id ?? "";
  const identityKey = JSON.stringify([
    profile,
    identityUser?.id ?? null,
    identityUser?.tenantId ?? null,
  ]);
  const identityRef = useRef<string | null>(null);
  const latestIdentityRef = useRef(identityKey);
  latestIdentityRef.current = identityKey;
  const lastChatRef = useRef<{
    identity: string;
    params: KnowledgeRouteParams;
  } | null>(null);
  const identityChanged =
    identityRef.current !== null && identityRef.current !== identityKey;
  const currentRoute =
    identityChanged && snapshot.current.page === "chat"
      ? { page: "chat" as const, params: {} }
      : snapshot.current;

  useEffect(() => {
    if (!authReady) return;
    if (identityChanged) {
      lastChatRef.current = null;
      const previous = scope.getSnapshot().current;
      identityRef.current = identityKey;
      scope.reset();
      scope.replace(
        previous.page === "chat" ? { page: "chat", params: {} } : previous,
      );
    } else {
      identityRef.current = identityKey;
    }
  }, [authReady, identityChanged, identityKey, scope]);

  useEffect(() => {
    if (authReady && !identityChanged && snapshot.current.page === "chat") {
      lastChatRef.current = {
        identity: identityKey,
        params: snapshot.current.params,
      };
    }
  }, [authReady, identityChanged, identityKey, snapshot]);

  const handleNavigate = useCallback(
    (target: KnowledgeNavigateTarget): void => {
      if (latestIdentityRef.current !== identityKey) return;
      const previous = scope.getSnapshot().current;
      if (previous.page === "chat")
        lastChatRef.current = {
          identity: identityKey,
          params: previous.params,
        };
      const remembered = lastChatRef.current;
      const restore =
        target.page === "chat" &&
        !target.params?.sessionId &&
        !target.params?.knowledgeSetId;
      scope.push(
        restore && remembered?.identity === identityKey
          ? { page: "chat", params: remembered.params }
          : target,
      );
    },
    [scope, identityKey],
  );

  const handleReplace = useCallback(
    (target: KnowledgeNavigateTarget): void => {
      if (latestIdentityRef.current !== identityKey) return;
      if (target.page === "chat") {
        lastChatRef.current = {
          identity: identityKey,
          params: target.params ?? {},
        };
        if (scope.getSnapshot().current.page !== "chat") return;
      }
      scope.replace(target);
    },
    [scope, identityKey],
  );
  const handleBack = useCallback(() => scope.back(), [scope]);

  return (
    <div
      className="knowledge-view"
      data-testid="knowledge-view"
      data-active={active ? "true" : "false"}
      data-page={currentRoute.page}
      data-auth-subject={authSubject}
      data-authenticated={authState.authenticated ? "true" : "false"}
      data-knowledge-mode={mode?.dataMode ?? "unknown"}
    >
      <span className="knowledge-sr-only" data-testid="knowledge-route-page">
        {currentRoute.page}
      </span>
      {authReady && (
        <KnowledgePages
          key={identityKey}
          active={active}
          page={currentRoute.page}
          params={currentRoute.params}
          profile={profile}
          onNavigate={handleNavigate}
          onReplace={handleReplace}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

export default KnowledgeView;
