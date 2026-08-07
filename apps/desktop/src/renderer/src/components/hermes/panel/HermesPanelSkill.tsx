import { useEffect, useRef, useState } from "react";
import { HERMES_PANEL_DEFAULT_PROFILE } from "../constants";
import { matchSkillName } from "../lib/match-skill-name";
import "./hermes-panel-skill.css";

export interface HermesPanelSkillOption {
  label: string;
  value: string;
  category?: string;
  description?: string;
  path?: string;
}

export interface HermesPanelSkillValidation {
  status: "idle" | "loading" | "valid" | "invalid" | "error";
  requiredSkillName?: string;
  message?: string;
  installedSkills: HermesPanelSkillOption[];
}

export interface HermesPanelSkillProps {
  profile?: string;
  value: string;
  requiredSkillName?: string;
  allowDefault?: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (skillName: string) => void;
  onValidationChange?: (validation: HermesPanelSkillValidation) => void;
}

export function HermesPanelSkill({
  profile = HERMES_PANEL_DEFAULT_PROFILE,
  value,
  requiredSkillName,
  allowDefault = false,
  disabled = false,
  className,
  onChange,
  onValidationChange,
}: HermesPanelSkillProps): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<HermesPanelSkillOption[]>([]);
  const onChangeRef = useRef(onChange);
  const onValidationChangeRef = useRef(onValidationChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onValidationChangeRef.current = onValidationChange;
  }, [onChange, onValidationChange]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      onValidationChangeRef.current?.({
        status: "loading",
        requiredSkillName,
        installedSkills: [],
      });

      try {
        const installed = await window.hermesAPI.listInstalledSkills(profile);
        if (cancelled) return;

        const nextOptions = installed.map((item) => ({
          label: item.category ? `${item.category}/${item.name}` : item.name,
          value: item.name,
          category: item.category,
          description: item.description,
          path: item.path,
        }));

        setOptions(nextOptions);

        const matched = requiredSkillName
          ? nextOptions.find((item) => matchSkillName(requiredSkillName, item))
          : null;

        if (requiredSkillName) {
          if (matched) {
            onChangeRef.current(matched.value);
            onValidationChangeRef.current?.({
              status: "valid",
              requiredSkillName,
              installedSkills: nextOptions,
            });
          } else {
            onChangeRef.current("");
            onValidationChangeRef.current?.({
              status: "invalid",
              requiredSkillName,
              message: `Skill 未安装：${requiredSkillName}`,
              installedSkills: nextOptions,
            });
          }
        } else if (nextOptions.length === 0) {
          onValidationChangeRef.current?.({
            status: "invalid",
            installedSkills: nextOptions,
            message: "当前 Hermes profile 未安装任何 skill",
          });
        } else {
          onValidationChangeRef.current?.({
            status: "valid",
            installedSkills: nextOptions,
          });
        }
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error
            ? e.message
            : "无法读取当前 Hermes skills，请检查 hermes-agent runtime。";
        setError(message);
        onValidationChangeRef.current?.({
          status: "error",
          requiredSkillName,
          message,
          installedSkills: [],
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [profile, requiredSkillName]);

  const selectableOptions = allowDefault
    ? [{ label: "default", value: "" }, ...options]
    : options;

  const invalidRequiredSkill =
    value !==  "" &&
    requiredSkillName &&
    !options.some((item) => matchSkillName(requiredSkillName, item));

  return (
    <div className={`hermes-panel-skill${className ? ` ${className}` : ""}`}>
      <label className="hermes-panel-skill__field">
        <span className="hermes-panel-skill__label">技能</span>
        <select
          className="hermes-panel-skill__select"
          value={value}
          disabled={disabled || loading || !!invalidRequiredSkill || !!error}
          onChange={(event) => onChange(event.target.value)}
        >
          {selectableOptions.length === 0 ? (
            <option value="">（无可用 skill）</option>
          ) : (
            selectableOptions.map((item) => (
              <option
                key={item.category ? `${item.category}/${item.value}` : item.value || "default"}
                value={item.value}
              >
                {item.label}
              </option>
            ))
          )}
        </select>
      </label>

      {loading ? <p className="hermes-panel-skill__hint">正在读取 skills…</p> : null}
      {error ? <p className="hermes-panel-skill__error">{error}</p> : null}
      {invalidRequiredSkill ? (
        <p className="hermes-panel-skill__error">
          Skill 未安装：{requiredSkillName}
          <br />
          请先在 Local Hermes / Skills 中安装后重新触发业务页面按钮。
        </p>
      ) : null}
      {!loading && !error && !invalidRequiredSkill && options.length === 0 ? (
        <p className="hermes-panel-skill__error">当前 Hermes profile 未安装任何 skill。</p>
      ) : null}
    </div>
  );
}
