import { AiosCopilotChatHost } from "./AiosCopilotChatHost";
import { HermesDefaultWebChatSurface as HermesDefaultWebChatSurfaceLegacy } from "./HermesDefaultWebChatSurface.legacy";

/**
 * Chat entry with engine switch:
 * - VITE_CHAT_ENGINE=legacy → previous HermesDefaultWebChatSurface
 * - default / VITE_CHAT_ENGINE=copilot → Copilot ChatSurface host
 */
export default function HermesDefaultChatPage(): React.JSX.Element {
  const engine = (import.meta.env.VITE_CHAT_ENGINE as string | undefined) || "copilot";
  if (engine === "legacy") {
    return <HermesDefaultWebChatSurfaceLegacy />;
  }
  return <AiosCopilotChatHost />;
}
