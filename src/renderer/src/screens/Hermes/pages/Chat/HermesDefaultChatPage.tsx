import { MultiRunChatShell } from "./MultiRunChatShell";
import { HermesDefaultWebChatSurface } from "./HermesDefaultWebChatSurface.legacy";

/**
 * Local Hermes Chat page entry.
 * - VITE_CHAT_ENGINE=legacy → previous HermesDefaultWebChatSurface
 * - default / VITE_CHAT_ENGINE=copilot → multi-run Copilot Chat host
 */
export default function HermesDefaultChatPage(): React.JSX.Element {
  const engine =
    (import.meta.env.VITE_CHAT_ENGINE as string | undefined) || "copilot";
  if (engine === "legacy") {
    return <HermesDefaultWebChatSurface />;
  }
  return <MultiRunChatShell />;
}
