export type PipMirrorPresetId =
  | "tsinghua"
  | "aliyun"
  | "tencent"
  | "official"
  | "custom";

export interface PipMirrorConfig {
  pipIndexUrl: string;
  trustedHost: string;
}

export const DEFAULT_PIP_MIRROR: PipMirrorConfig = {
  pipIndexUrl: "https://pypi.tuna.tsinghua.edu.cn/simple",
  trustedHost: "pypi.tuna.tsinghua.edu.cn",
};

export interface PipMirrorPreset extends PipMirrorConfig {
  id: PipMirrorPresetId;
  /** i18n key under install.* */
  labelKey: string;
}

export const PIP_MIRROR_PRESETS: readonly PipMirrorPreset[] = [
  {
    id: "tsinghua",
    labelKey: "pipMirrorTsinghua",
    pipIndexUrl: "https://pypi.tuna.tsinghua.edu.cn/simple",
    trustedHost: "pypi.tuna.tsinghua.edu.cn",
  },
  {
    id: "aliyun",
    labelKey: "pipMirrorAliyun",
    pipIndexUrl: "https://mirrors.aliyun.com/pypi/simple/",
    trustedHost: "mirrors.aliyun.com",
  },
  {
    id: "tencent",
    labelKey: "pipMirrorTencent",
    pipIndexUrl: "https://mirrors.cloud.tencent.com/pypi/simple",
    trustedHost: "mirrors.cloud.tencent.com",
  },
  {
    id: "official",
    labelKey: "pipMirrorOfficial",
    pipIndexUrl: "https://pypi.org/simple",
    trustedHost: "",
  },
  {
    id: "custom",
    labelKey: "pipMirrorCustom",
    pipIndexUrl: "",
    trustedHost: "",
  },
] as const;

export function trustedHostFromPipIndexUrl(indexUrl: string): string {
  try {
    return new URL(indexUrl.trim()).hostname;
  } catch {
    return "";
  }
}

export function resolvePipMirrorFromPreset(
  presetId: PipMirrorPresetId,
  custom?: Partial<PipMirrorConfig>,
): PipMirrorConfig {
  if (presetId === "custom") {
    const pipIndexUrl = custom?.pipIndexUrl?.trim() || "";
    const trustedHost =
      custom?.trustedHost?.trim() || trustedHostFromPipIndexUrl(pipIndexUrl);
    return { pipIndexUrl, trustedHost };
  }

  const preset = PIP_MIRROR_PRESETS.find((p) => p.id === presetId);
  return preset
    ? { pipIndexUrl: preset.pipIndexUrl, trustedHost: preset.trustedHost }
    : { ...DEFAULT_PIP_MIRROR };
}
