export { ChatSurface } from "./components/ChatSurface";
export type { ChatSurfaceProps, ChatSurfaceSlots } from "./components/ChatSurface";
export * from "./ports";
export * from "./adapters/aios";
export * from "./controller";
export {
  upsertChatRun,
  listChatRuns,
  getChatRun,
  patchChatRun,
} from "./workspace/chatRunRegistry";
export { useChatWorkspaceManager } from "./workspace/useChatWorkspaceManager";
export {
  ChatWorkspaceProvider,
  useChatWorkspace,
} from "./workspace/ChatWorkspaceProvider";
export {
  ChatRunTabs,
  ChatRunHost,
  BackgroundRunIndicator,
} from "./workspace/ChatRunTabs";
