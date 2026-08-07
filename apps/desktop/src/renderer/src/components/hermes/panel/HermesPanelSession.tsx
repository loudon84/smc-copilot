import { useEffect, useRef, useState } from "react";
import { HERMES_PANEL_DEFAULT_PROFILE } from "../constants";
import "./hermes-panel-session.css";

export interface HermesPanelSessionOption {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
}

export interface HermesPanelSessionProps {
  profile?: string;
  value: string | null;
  days?: number;
  limit?: number;
  disabled?: boolean;
  className?: string;
  onChange: (sessionId: string | null) => void;
  onLoaded?: (sessions: HermesPanelSessionOption[]) => void;
}

export function HermesPanelSession({
  profile: _profile = HERMES_PANEL_DEFAULT_PROFILE,
  value,
  days = 7,
  limit = 100,
  disabled = false,
  className,
  onChange,
  onLoaded,
}: HermesPanelSessionProps): React.JSX.Element {
  void _profile;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<HermesPanelSessionOption[]>([]);
  const onChangeRef = useRef(onChange);
  const onLoadedRef = useRef(onLoaded);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
    onLoadedRef.current = onLoaded;
    valueRef.current = value;
  }, [onChange, onLoaded, value]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        await window.hermesAPI.syncSessionCache();
        const cached = await window.hermesAPI.listCachedSessions(limit, 0);
        if (cancelled) return;

        const nowSeconds = Math.floor(Date.now() / 1000);
        const since = nowSeconds - days * 24 * 60 * 60;

        const recent = cached
          .filter((item) => item.startedAt >= since)
          .map((item) => ({
            id: item.id,
            title: item.title || item.id,
            startedAt: item.startedAt,
            source: item.source,
            messageCount: item.messageCount,
            model: item.model,
          }));

        setSessions(recent);
        onLoadedRef.current?.(recent);

        const currentValue = valueRef.current;
        if (currentValue && !recent.some((item) => item.id === currentValue)) {
          onChangeRef.current(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [days, limit]);

  return (
    <div className={`hermes-panel-session${className ? ` ${className}` : ""}`}>
      <label className="hermes-panel-session__field">
        <span className="hermes-panel-session__label">会话</span>
        <select
          className="hermes-panel-session__select"
          value={value ?? ""}
          disabled={disabled || loading}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">新建会话</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title} · {session.messageCount}条 · {session.model}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="hermes-panel-session__hint">正在读取最近 {days} 天 sessions…</p>
      ) : null}
      {error ? <p className="hermes-panel-session__error">{error}</p> : null}
      {!loading && !error && sessions.length === 0 ? (
        <p className="hermes-panel-session__hint">最近 {days} 天没有可继续的会话</p>
      ) : null}
    </div>
  );
}
