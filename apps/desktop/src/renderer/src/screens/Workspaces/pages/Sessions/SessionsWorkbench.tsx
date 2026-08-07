import { useWorkspaces } from "../../context/WorkspacesContext";
import Sessions from "./Sessions";

export default function SessionsWorkbench(): React.JSX.Element {
  const { activeSessionId, setActiveSessionId, setActiveNavItem } = useWorkspaces();

  return (
    <Sessions
      visible
      currentSessionId={activeSessionId}
      onResumeSession={(sessionId) => {
        setActiveSessionId(sessionId);
        setActiveNavItem("chat");
      }}
      onNewChat={() => {
        setActiveSessionId(null);
        setActiveNavItem("chat");
      }}
    />
  );
}
