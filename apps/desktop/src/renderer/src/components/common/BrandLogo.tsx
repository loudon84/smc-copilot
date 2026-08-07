import { Bot, Cpu } from "lucide-react";

interface BrandLogoProps {
  provider: string;
  modelId?: string;
  size?: number;
}

interface BrandStyle {
  label: string;
  bg: string;
  fg: string;
}

const PROVIDER_STYLES: Record<string, BrandStyle> = {
  openrouter: { label: "OR", bg: "#3b2f6b", fg: "#e8e0ff" },
  anthropic: { label: "A", bg: "#d97757", fg: "#fff7f2" },
  openai: { label: "AI", bg: "#0d8a6a", fg: "#ecfff8" },
  google: { label: "G", bg: "#4285f4", fg: "#ffffff" },
  xai: { label: "X", bg: "#111111", fg: "#f5f5f5" },
  nous: { label: "N", bg: "#1f4fd6", fg: "#eef3ff" },
  qwen: { label: "Q", bg: "#6b4eff", fg: "#f3efff" },
  minimax: { label: "M", bg: "#2563eb", fg: "#eff6ff" },
  custom: { label: "LC", bg: "#334155", fg: "#f8fafc" },
  auto: { label: "?", bg: "#475569", fg: "#f8fafc" },
};

function inferProviderFromModel(modelId: string): string | null {
  const id = modelId.toLowerCase();
  if (/claude|anthropic/.test(id)) return "anthropic";
  if (/gpt|openai|o1|o3|o4/.test(id)) return "openai";
  if (/gemini|google/.test(id)) return "google";
  if (/grok|xai/.test(id)) return "xai";
  if (/qwen/.test(id)) return "qwen";
  if (/minimax/.test(id)) return "minimax";
  if (/nous|hermes|deephermes/.test(id)) return "nous";
  if (/llama|mistral|mixtral|qwen|local/.test(id)) return "custom";
  return null;
}

function resolveStyle(provider: string, modelId?: string): BrandStyle {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "auto" && modelId) {
    const inferred = inferProviderFromModel(modelId);
    if (inferred && PROVIDER_STYLES[inferred]) {
      return PROVIDER_STYLES[inferred];
    }
  }
  return PROVIDER_STYLES[normalized] ?? PROVIDER_STYLES.auto;
}

function BrandLogo({
  provider,
  modelId,
  size = 20,
}: BrandLogoProps): React.JSX.Element {
  const style = resolveStyle(provider, modelId);
  const isLocal = provider === "custom";
  const fontSize = Math.max(8, Math.round(size * 0.42));

  return (
    <span
      className="brand-logo"
      title={provider}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: style.bg,
        color: style.fg,
        fontSize,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {isLocal ? (
        <Cpu size={Math.round(size * 0.55)} strokeWidth={2.25} />
      ) : provider === "auto" && !modelId ? (
        <Bot size={Math.round(size * 0.55)} strokeWidth={2.25} />
      ) : (
        style.label
      )}
    </span>
  );
}

export default BrandLogo;
