import { HermesTaskStartDialog } from "./HermesTaskStartDialog";
import { useWebOperatorPageContext } from "./context";

/** Screen-level host for the Hermes task start modal (portal + native layer hide). */
export function WebOperatorTaskStartDialogHost(): React.JSX.Element | null {
  const { analysisRequest, taskStartDialog, taskStartDialogHandlers } =
    useWebOperatorPageContext();

  const showDialog =
    taskStartDialog != null &&
    taskStartDialogHandlers != null &&
    taskStartDialog.requestId === analysisRequest?.requestId;

  if (!showDialog) return null;

  return (
    <HermesTaskStartDialog
      pageContext={taskStartDialog.pageContext}
      pageUrl={taskStartDialog.pageUrl}
      profile={taskStartDialog.profile}
      requiredSkillName={taskStartDialog.requiredSkillName}
      formType={taskStartDialog.formType}
      action={taskStartDialog.action}
      callbackUrl={taskStartDialog.callbackUrl}
      defaultSessionId={taskStartDialog.defaultSessionId}
      missingSkill={taskStartDialog.missingSkill}
      missingSkillMessage={taskStartDialog.missingSkillMessage}
      onConfirm={taskStartDialogHandlers.onConfirm}
      onCancel={taskStartDialogHandlers.onCancel}
    />
  );
}
