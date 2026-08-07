import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  HermesPanelSession,
  HermesPanelSkill,
  type HermesPanelPageContext,
  type HermesPanelSkillValidation,
} from "../../components/hermes";
import { HERMES_PANEL_DEFAULT_PROFILE } from "../../components/hermes/constants";
import { buildPageContextSummary } from "./utils/page-context-summary";
import "./HermesTaskStartDialog.css";

export interface HermesTaskStartDialogProps {
  pageContext: HermesPanelPageContext;
  pageUrl: string;
  profile?: string;
  requiredSkillName?: string;
  formType?: string;
  action?: "create" | "edit" | "view" | "analytic";
  callbackUrl?: string;
  defaultSessionId?: string | null;
  missingSkill?: boolean;
  missingSkillMessage?: string;
  onConfirm: (input: {
    userPrompt: string;
    skill: string;
    sessionId: string | null;
    /** Host Bridge 传入的 callbackUrl，写入任务 hostBridge 与首条消息 SkillParamsJSON */
    callbackUrl?: string;
  }) => void;
  onCancel: () => void;
}

export function HermesTaskStartDialog({
  pageContext,
  pageUrl,
  profile,
  requiredSkillName,
  formType,
  action,
  callbackUrl,
  defaultSessionId,
  missingSkill,
  missingSkillMessage,
  onConfirm,
  onCancel,
}: HermesTaskStartDialogProps): React.JSX.Element {
  const [userPrompt, setUserPrompt] = useState("");
  const [skill, setSkill] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(defaultSessionId ?? null);
  const [skillValidation, setSkillValidation] = useState<HermesPanelSkillValidation>({
    status: "idle",
    installedSkills: [],
  });

  const canSubmit = !missingSkill && skillValidation.status === "valid" && !!skill;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const blockEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", blockEscape, true);
    return () => document.removeEventListener("keydown", blockEscape, true);
  }, []);

  const summary = buildPageContextSummary(pageContext);

  return createPortal(
    <div
      className="hermes-task-start-dialog__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hermes-task-start-dialog-title"
    >
      <div className="hermes-task-start-dialog__panel">
        <h3 id="hermes-task-start-dialog-title" className="hermes-task-start-dialog__title">
          启动任务
        </h3>

        <div className="hermes-task-start-dialog__meta">
          <p>
            <span className="hermes-task-start-dialog__meta-label">页面：</span>
            {summary}
          </p>
          {pageUrl ? (
            <p>
              <span className="hermes-task-start-dialog__meta-label">URL：</span>
              {pageUrl}
            </p>
          ) : null}          
          {requiredSkillName ? (
            <p>
              <span className="hermes-task-start-dialog__meta-label">skillName：</span>
              {requiredSkillName}
            </p>
          ) : null}
          {callbackUrl ? (
            <p>
              <span className="hermes-task-start-dialog__meta-label">callbackUrl：</span>
              {callbackUrl}
            </p>
          ) : null}
        </div>

        {missingSkill && missingSkillMessage ? (
          <p className="hermes-task-start-dialog__error">{missingSkillMessage}</p>
        ) : null}

        <label className="hermes-task-start-dialog__field">
          <span className="hermes-task-start-dialog__label">用户提示词（可选）</span>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={3}
            placeholder="补充分析要求…"
            className="hermes-task-start-dialog__textarea"
            disabled={!!missingSkill}
          />
        </label>

        <HermesPanelSkill
          profile={profile ?? HERMES_PANEL_DEFAULT_PROFILE}
          value={skill}
          requiredSkillName={requiredSkillName}
          allowDefault={true}
          disabled={false}
          onChange={setSkill}
          onValidationChange={setSkillValidation}
        />

        <HermesPanelSession
          profile={profile ?? HERMES_PANEL_DEFAULT_PROFILE}
          value={sessionId}
          days={7}
          limit={100}
          disabled={!!missingSkill}
          onChange={setSessionId}
        />

        <div className="hermes-task-start-dialog__actions">
          <button type="button" onClick={onCancel} className="hermes-task-start-dialog__btn">
            {missingSkill ? "关闭" : "取消"}
          </button>
          {!missingSkill ? (
            <button
              type="button"
              disabled={false}
              onClick={() =>
                onConfirm({
                  userPrompt: userPrompt.trim(),
                  skill,
                  sessionId,
                  callbackUrl: callbackUrl?.trim() || undefined,
                })
              }
              className="hermes-task-start-dialog__btn hermes-task-start-dialog__btn--primary"
            >
              确认执行
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
