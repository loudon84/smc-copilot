import "./Hermes.css";
import { ChatWorkspaceProvider } from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import { HermesDefaultProvider } from "./context/HermesDefaultContext";
import { HermesExpertsProvider } from "./context/HermesExpertsContext";
import { HermesWorkspaceProvider } from "./context/HermesWorkspaceContext";
import { HermesShell } from "./panels/HermesShell";
import { useRemoteExpertContextBridge } from "./hooks/useRemoteExpertContextBridge";

export interface HermesScreenProps {
  activePanel?: string;
  onPanelChange?: (panel: string) => void;
  onOpenRuntimeSettings?: () => void;
}

function HermesScreenInner(props: HermesScreenProps) {
  useRemoteExpertContextBridge();
  return (
    <HermesShell
      activePanel={props.activePanel}
      onPanelChange={props.onPanelChange}
      onOpenRuntimeSettings={props.onOpenRuntimeSettings}
    />
  );
}

export function HermesScreen({
  activePanel,
  onPanelChange,
  onOpenRuntimeSettings,
}: HermesScreenProps) {
  return (
    <HermesDefaultProvider>
      <HermesWorkspaceProvider>
        <HermesExpertsProvider>
          <ChatWorkspaceProvider>
            <HermesScreenInner
              activePanel={activePanel}
              onPanelChange={onPanelChange}
              onOpenRuntimeSettings={onOpenRuntimeSettings}
            />
          </ChatWorkspaceProvider>
        </HermesExpertsProvider>
      </HermesWorkspaceProvider>
    </HermesDefaultProvider>
  );
}
