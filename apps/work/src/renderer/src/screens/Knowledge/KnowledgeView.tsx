import { useEffect, useRef, useState, type ReactElement } from "react";
import type { DesktopAuthState } from "../../../../shared/auth/auth-contract";
import type { KnowledgeModeSnapshot } from "../../../../shared/knowledge/knowledge-job-ipc";
import {
  createKnowledgeRouteScope,
  type KnowledgeRouteScope,
  type KnowledgeRouteSnapshot,
} from "./knowledge-route-scope";
import { KnowledgePages } from "./KnowledgePages";

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
    const apply = (state: DesktopAuthState): void => {
      if (cancelled) return;
      setAuthState({
        authenticated: state.authenticated,
        endpointConfig: state.endpointConfig,
        user: state.user,
        expiresAt: state.expiresAt,
      });
    };

    void api.getState().then(apply);
    const unsubscribe = api.onStateChanged(apply);
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
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") {
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

  const authSubject = authState.user?.id ?? "";

  return (
    <div
      className="knowledge-view"
      data-testid="knowledge-view"
      data-active={active ? "true" : "false"}
      data-page={snapshot.current.page}
      data-auth-subject={authSubject}
      data-authenticated={authState.authenticated ? "true" : "false"}
      data-knowledge-mode={mode?.dataMode ?? "unknown"}
    >
      <span className="knowledge-sr-only" data-testid="knowledge-route-page">
        {snapshot.current.page}
      </span>
      <KnowledgePages
        page={snapshot.current.page}
        params={snapshot.current.params}
        profile={profile}
        onNavigate={(target) => {
          scope.push(target);
        }}
        onReplace={(target) => {
          scope.replace(target);
        }}
        onBack={() => {
          scope.back();
        }}
      />
    </div>
  );
}

export default KnowledgeView;
