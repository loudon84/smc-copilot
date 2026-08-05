import { ChatSurface } from "@renderer/modules/chat/components/ChatSurface";
import {
  aiosChatRuntimeAdapter,
  aiosSessionAdapter,
  aiosFilesAdapter,
  aiosModelsAdapter,
  aiosNavigationAdapter,
} from "@renderer/modules/chat/adapters/aios";
import { HermesActiveExpertBar } from "./components/HermesActiveExpertBar";
import { TaskStatusBar } from "./components/TaskStatusBar";
import { WorkChatContextBar } from "./components/work/WorkChatContextBar";
import { WorkComposerControls } from "./components/work/WorkComposerControls";
import { useHermesWorkspace } from "../../context/HermesWorkspaceContext";
import { useWorkChatContext } from "./hooks/useWorkChatContext";

type Props = {
  forcedSessionId?: string | null;
  hideActiveExpertBar?: boolean;
};

/**
 * Host that mounts Copilot ChatSurface with AI-OS Work slots + adapters.
 */
export function AiosCopilotChatHost({
  forcedSessionId,
  hideActiveExpertBar,
}: Props = {}): React.JSX.Element {
  const workspace = useHermesWorkspace();
  const workContext = useWorkChatContext();
  const profileId = workspace.activeProfileId || "default";
  const showWorkControls = !hideActiveExpertBar;

  return (
    <ChatSurface
      runtime={aiosChatRuntimeAdapter}
      session={aiosSessionAdapter}
      files={aiosFilesAdapter}
      models={aiosModelsAdapter}
      navigation={aiosNavigationAdapter}
      profileId={profileId}
      sessionId={forcedSessionId}
      expertId={workContext.selectedExpert?.slug}
      teamId={workspace.activeTeamId}
      workMode={workContext.permissionMode}
      activeExpertSlot={showWorkControls ? <HermesActiveExpertBar /> : null}
      statusBarSlot={
        <TaskStatusBar
          title={workContext.selectedSkill?.name || "Chat"}
          status="ready"
          expertName={workContext.selectedExpert?.name}
          skillName={workContext.selectedSkill?.name}
          profileId={profileId}
          durationMs={0}
        />
      }
      contextBarSlot={
        showWorkControls ? <WorkChatContextBar context={workContext} /> : null
      }
      composerControlsSlot={
        showWorkControls ? <WorkComposerControls context={workContext} /> : null
      }
    />
  );
}

export default AiosCopilotChatHost;
