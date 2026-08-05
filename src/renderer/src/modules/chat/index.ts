export { ChatSurface } from "./components/ChatSurface";
export type {
  ChatSurfaceProps,
  ChatSurfaceSlots,
  ControllerStateChangeSnapshot,
} from "./components/ChatSurface";
export { ChatRunHeader } from "./components/header/ChatRunHeader";
export { ChatRunStatus } from "./components/header/ChatRunStatus";
export { WorkContextChip } from "./components/composer/WorkContextChip";
export { WorkContextPopover } from "./components/composer/WorkContextPopover";
export {
  PromptAssistPanel,
  resolveEffectivePromptHint,
} from "./components/composer/PromptAssistPanel";
export { ComposerMoreMenu } from "./components/composer/ComposerMoreMenu";
export { ChatContentRail } from "./layout/ChatContentRail";
export * from "./ports";
export * from "./adapters/aios";
export * from "./controller";
export type {
  ChatRunRecord,
  DeepPartial,
  OpenChatRunInput,
  PromptHintState,
} from "./workspace/ChatRunRecord";
export {
  createChatRunRecord,
  deriveTabTitle,
  isRunBusy,
  returnRunToDefault,
} from "./workspace/ChatRunRecord";
export {
  chatWorkspaceReducer,
  createInitialChatWorkspaceState,
} from "./workspace/chatWorkspaceReducer";
export {
  ChatWorkspaceProvider,
  useChatWorkspace,
} from "./workspace/ChatWorkspaceProvider";
export { useRunWorkContext } from "./workspace/useRunWorkContext";
export {
  ChatRunTabs,
  ChatRunHost,
  BackgroundRunIndicator,
} from "./workspace/ChatRunTabs";

/** @deprecated Use ChatWorkspaceProvider / chatWorkspaceReducer (v8.0.3). */
export {
  upsertChatRun,
  listChatRuns,
  getChatRun,
  patchChatRun,
} from "./workspace/chatRunRegistry";
/** @deprecated Use ChatWorkspaceProvider (v8.0.3). */
export { useChatWorkspaceManager } from "./workspace/useChatWorkspaceManager";
