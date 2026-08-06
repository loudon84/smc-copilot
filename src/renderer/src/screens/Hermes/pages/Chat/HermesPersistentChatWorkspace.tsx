import { useChatWorkspace } from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import { MultiRunChatShellInner } from "./MultiRunChatShell";
import { HermesDefaultWebChatSurface } from "./HermesDefaultWebChatSurface.legacy";

type Props = {
  /** When false, workspace stays mounted but is hidden (visibility only). */
  visible: boolean;
  hideActiveExpertBar?: boolean;
};

/**
 * Always-mounted Chat workspace (v8.2).
 * Menu switches only change visibility — never unmounts MultiRunChatShell.
 */
// @lat: [[domain/chat#Persistent mount and session catalog]]
export function HermesPersistentChatWorkspace({
  visible,
  hideActiveExpertBar,
}: Props): React.JSX.Element {
  const { restoring } = useChatWorkspace();
  const engine =
    (import.meta.env.VITE_CHAT_ENGINE as string | undefined) || "copilot";

  return (
    <div
      className={
        visible
          ? "chat-workspace chat-workspace--visible"
          : "chat-workspace chat-workspace--hidden"
      }
      aria-hidden={!visible}
      data-testid="hermes-persistent-chat-workspace"
    >
      {restoring ? (
        <div
          className="chat-workspace-restoring"
          data-testid="chat-workspace-restoring"
        >
          Restoring chat workspace…
        </div>
      ) : engine === "legacy" ? (
        <HermesDefaultWebChatSurface />
      ) : (
        <MultiRunChatShellInner hideActiveExpertBar={hideActiveExpertBar} />
      )}
    </div>
  );
}

export default HermesPersistentChatWorkspace;
