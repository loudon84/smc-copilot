import { useCallback, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useHostBridgeCommand } from "../../../../screens/WebOperator/host-bridge/HostBridgeCommandContext";
import { extractHostFormFillArtifact } from "./extractHostFormFillArtifact";
import { normalizeProductFillFields } from "./normalizeProductFillFields";
import type { HostFormFillArtifact } from "./types";

type FillButtonState = "idle" | "pending" | "success" | "error" | "timeout";

function resolveFormTypeMismatch(
  artifact: HostFormFillArtifact,
  lastFormType: string | undefined,
): string | null {
  if (!lastFormType?.trim()) return null;
  if (!artifact.formType?.trim()) return null;
  if (artifact.formType === lastFormType) return null;
  return `当前页面表单类型为「${lastFormType}」，与数据类型「${artifact.formType}」不一致`;
}

export function HostFormFillActionButton({
  content,
}: {
  content: string;
}): React.JSX.Element | null {
  const { lastEvent, lastReadyEvent, hostBridgeReady, runCommand, sending } =
    useHostBridgeCommand();
  const [state, setState] = useState<FillButtonState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const artifact = useMemo(() => extractHostFormFillArtifact(content), [content]);
  const pageFormType = lastEvent?.formType ?? lastReadyEvent?.formType;
  const formTypeMismatch = useMemo(
    () => (artifact ? resolveFormTypeMismatch(artifact, pageFormType) : null),
    [artifact, pageFormType],
  );

  const handleFill = useCallback(async () => {
    if (!artifact) return;
    if (formTypeMismatch) {
      setState("error");
      setStatusMessage(formTypeMismatch);
      return;
    }

    setState("pending");
    setStatusMessage(null);

    const normalizedFields = normalizeProductFillFields(artifact.fields);
    const command = {
      commandId: `cmd_fill_${Date.now()}`,
      type: "desktop.host.form.fill" as const,
      formType: artifact.formType || pageFormType || "product",
      action: artifact.action || "create",
      payload: {
        fields: normalizedFields,
        subTables: artifact.subTables ?? {},
      },
      createdAt: new Date().toISOString(),
      expectAck: true as const,
      timeoutMs: 12000,
    };

    // eslint-disable-next-line no-debugger
    debugger; // DEBUG: inspect artifact, normalizedFields, command before send

    const result = await runCommand(command);

    // eslint-disable-next-line no-debugger
    debugger; // DEBUG: inspect result after send

    if (!result) {
      setState("error");
      setStatusMessage("写回失败：未收到 HostBridge 响应");
      return;
    }

    if (result.ok) {
      setState("success");
      setStatusMessage("已写回当前表单");
      return;
    }

    if (result.errorCode === "COMMAND_ACK_TIMEOUT") {
      setState("timeout");
      setStatusMessage("写回超时，请检查页面 HostBridge 状态");
      return;
    }

    setState("error");
    setStatusMessage(result.message ?? "写回失败");
  }, [artifact, formTypeMismatch, pageFormType, runCommand]);

  if (!artifact) return null;

  const disabled = !hostBridgeReady || sending || state === "pending";

  let buttonLabel = "写回当前表单";
  if (state === "pending") buttonLabel = "写回中…";
  else if (state === "success") buttonLabel = "已写回";
  else if (state === "timeout") buttonLabel = "写回超时";
  else if (state === "error") buttonLabel = "写回失败";

  return (
    <div className="web-operator-hermes-panel__form-fill-action">
      <button
        type="button"
        className="web-operator-hermes-panel__btn web-operator-hermes-panel__btn--fill"
        disabled={disabled}
        onClick={() => void handleFill()}
        title={
          !hostBridgeReady
            ? "HostBridge 未就绪：请确认左侧表单页已加载且 WebOperator 页签可用"
            : undefined
        }
      >
        <Send size={12} />
        {buttonLabel}
      </button>
      {!hostBridgeReady ? (
        <p className="web-operator-hermes-panel__form-fill-hint">HostBridge 未就绪</p>
      ) : null}
      {formTypeMismatch ? (
        <p className="web-operator-hermes-panel__form-fill-hint web-operator-hermes-panel__form-fill-hint--warn">
          {formTypeMismatch}
        </p>
      ) : null}
      {statusMessage ? (
        <p
          className={`web-operator-hermes-panel__form-fill-hint${
            state === "success"
              ? " web-operator-hermes-panel__form-fill-hint--success"
              : state === "error" || state === "timeout"
                ? " web-operator-hermes-panel__form-fill-hint--error"
                : ""
          }`}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
