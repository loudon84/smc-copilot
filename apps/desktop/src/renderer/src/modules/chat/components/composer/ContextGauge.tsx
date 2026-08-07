import { memo } from "react";

export type ContextUsage = {
  used: number;
  window: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1);
    return `${val.endsWith(".0") ? val.slice(0, -2) : val}M`;
  }
  if (n >= 1000) {
    const val = (n / 1000).toFixed(1);
    return `${val.endsWith(".0") ? val.slice(0, -2) : val}k`;
  }
  return String(Math.round(n));
}

export const ContextGauge = memo(function ContextGauge({
  used,
  window: ctxWindow,
}: ContextUsage): React.JSX.Element {
  const pct =
    ctxWindow > 0 ? Math.min(100, Math.round((used / ctxWindow) * 100)) : 0;
  const size = 26;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;

  return (
    <div
      className="chat-ctx-gauge"
      tabIndex={0}
      role="img"
      aria-label={`Context ${pct}% (${fmtTokens(used)} / ${fmtTokens(ctxWindow)})`}
      title={`${fmtTokens(used)} / ${fmtTokens(ctxWindow)} (${pct}%)`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="chat-ctx-gauge-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          opacity={0.25}
        />
        <circle
          className="chat-ctx-gauge-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="chat-ctx-gauge-label">{pct}%</span>
    </div>
  );
});
