import { useEffect, useState } from "react";
import { useI18n } from "../useI18n";
import {
  PIP_MIRROR_PRESETS,
  resolvePipMirrorFromPreset,
  trustedHostFromPipIndexUrl,
  type PipMirrorPresetId,
} from "../../../../shared/enterprise/pip-mirror-presets";

export interface PipMirrorSelection {
  pipMirrorPreset: PipMirrorPresetId;
  pipIndexUrl: string;
  trustedHost: string;
}

interface PipMirrorFieldsProps {
  value: PipMirrorSelection;
  onChange: (next: PipMirrorSelection) => void;
}

export function createDefaultPipMirrorSelection(): PipMirrorSelection {
  const preset = resolvePipMirrorFromPreset("tsinghua");
  return {
    pipMirrorPreset: "tsinghua",
    pipIndexUrl: preset.pipIndexUrl,
    trustedHost: preset.trustedHost,
  };
}

export function PipMirrorFields({
  value,
  onChange,
}: PipMirrorFieldsProps): React.JSX.Element {
  const { t } = useI18n();
  const [customUrl, setCustomUrl] = useState(
    value.pipMirrorPreset === "custom" ? value.pipIndexUrl : "",
  );
  const [customHost, setCustomHost] = useState(
    value.pipMirrorPreset === "custom" ? value.trustedHost : "",
  );

  useEffect(() => {
    if (value.pipMirrorPreset !== "custom") return;
    setCustomUrl(value.pipIndexUrl);
    setCustomHost(value.trustedHost);
  }, [value.pipMirrorPreset, value.pipIndexUrl, value.trustedHost]);

  function applyPreset(presetId: PipMirrorPresetId): void {
    if (presetId === "custom") {
      onChange({
        pipMirrorPreset: "custom",
        pipIndexUrl: customUrl,
        trustedHost: customHost || trustedHostFromPipIndexUrl(customUrl),
      });
      return;
    }
    const resolved = resolvePipMirrorFromPreset(presetId);
    onChange({
      pipMirrorPreset: presetId,
      pipIndexUrl: resolved.pipIndexUrl,
      trustedHost: resolved.trustedHost,
    });
  }

  return (
    <div className="install-pip">
      <div className="install-pip-header">
        <div className="install-pip-title">
          {t("install.pipMirrorTitle")}
        </div>
        <p className="install-pip-desc">
          {t("install.pipMirrorDesc")}
        </p>
      </div>

      <select
        className="install-form-select"
        value={value.pipMirrorPreset}
        onChange={(e) => applyPreset(e.target.value as PipMirrorPresetId)}
      >
        {PIP_MIRROR_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {t(`install.${preset.labelKey}`)}
          </option>
        ))}
      </select>

      {value.pipMirrorPreset === "custom" ? (
        <div className="install-pip-custom-fields">
          <div className="install-pip-field">
            <label className="install-pip-label">
              {t("install.pipMirrorUrl")}
            </label>
            <input
              type="url"
              className="install-form-input"
              value={customUrl}
              onChange={(e) => {
                const pipIndexUrl = e.target.value;
                setCustomUrl(pipIndexUrl);
                onChange({
                  pipMirrorPreset: "custom",
                  pipIndexUrl,
                  trustedHost:
                    customHost || trustedHostFromPipIndexUrl(pipIndexUrl),
                });
              }}
              placeholder="https://pypi.company.internal/simple"
            />
          </div>
          <div className="install-pip-field">
            <label className="install-pip-label">
              {t("install.pipMirrorTrustedHost")}
            </label>
            <input
              type="text"
              className="install-form-input"
              value={customHost}
              onChange={(e) => {
                const trustedHost = e.target.value;
                setCustomHost(trustedHost);
                onChange({
                  pipMirrorPreset: "custom",
                  pipIndexUrl: customUrl,
                  trustedHost:
                    trustedHost || trustedHostFromPipIndexUrl(customUrl),
                });
              }}
              placeholder="pypi.company.internal"
            />
          </div>
        </div>
      ) : (
        <p className="install-pip-url">{value.pipIndexUrl}</p>
      )}
    </div>
  );
}
