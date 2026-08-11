import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatSurface } from "@renderer/modules/chat/components/ChatSurface";
import type { ControllerStateChangeSnapshot } from "@renderer/modules/chat/components/ChatSurface";
import {
  aiosChatRuntimeAdapter,
  aiosSessionAdapter,
  aiosFilesAdapter,
  aiosModelsAdapter,
  aiosNavigationAdapter,
  aiosCommandAdapter,
  aiosWorkspaceAdapter,
  composeWorkPrompt,
} from "@renderer/modules/chat/adapters/aios";
import type { ChatFileRef } from "@renderer/modules/chat/ports/ChatFilesPort";
import { SessionFilesPanel } from "@renderer/modules/chat/components/session-files/SessionFilesPanel";
import { FilePreviewPanel } from "@renderer/modules/chat/components/files/preview/FilePreviewPanel";
import { WorktreePanel } from "@renderer/modules/chat/components/workspace/WorktreePanel";
import { useFilePreview } from "@renderer/modules/chat/hooks/files/useFilePreview";
import { useSessionFilesSummary } from "@renderer/modules/chat/hooks/useSessionFilesSummary";
import { ChatRunHeader } from "@renderer/modules/chat/components/header/ChatRunHeader";
import { WorkContextChip } from "@renderer/modules/chat/components/composer/WorkContextChip";
import { WorkContextPopover } from "@renderer/modules/chat/components/composer/WorkContextPopover";
import {
  PromptAssistPanel,
  resolveEffectivePromptHint,
} from "@renderer/modules/chat/components/composer/PromptAssistPanel";
import { ComposerMoreMenu } from "@renderer/modules/chat/components/composer/ComposerMoreMenu";
import type {
  ChatRunRecord,
  DeepPartial,
  PromptHintState,
} from "@renderer/modules/chat/workspace/ChatRunRecord";
import {
  useRunWorkContext,
  setRunWorkGatewayHealthApi,
} from "@renderer/modules/chat/workspace/useRunWorkContext";
import { useChatWorkspace } from "@renderer/modules/chat/workspace/ChatWorkspaceProvider";
import {
  buildExpertPromptHint,
  shouldBuildExpertPromptHint,
} from "./utils/buildExpertPromptHint";
import { ExpertSelector } from "./components/work/ExpertSelector";
import { ExpertSkillSelector } from "./components/work/ExpertSkillSelector";
import { PermissionSelector } from "./components/work/PermissionSelector";
import { GatewayStatusBadge } from "./components/work/GatewayStatusBadge";
import { createAiosChatRunContextAdapter } from "./AiosChatRunContextAdapter";
import { workExpertGatewayApi } from "../../api/workExpertGatewayApi";
import type { UseWorkChatContextReturn } from "../../types/work-chat";

setRunWorkGatewayHealthApi({
  getHealth: () => workExpertGatewayApi.getHealth(),
});

type Props = {
  run: ChatRunRecord;
  active: boolean;
  onPatchRun: (runId: string, patch: DeepPartial<ChatRunRecord>) => void;
  hideWorkControls?: boolean;
};

function useComposerDensity(): "full" | "expert" | "icon" {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (width >= 1280) return "full";
  if (width >= 960) return "expert";
  return "icon";
}

function useViewportTier(): "wide" | "medium" | "narrow" {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (width >= 1440) return "wide";
  if (width >= 1100) return "medium";
  return "narrow";
}

/**
 * Host that mounts Copilot ChatSurface with AI-OS Work slots + adapters.
 * v1.6.1: Composer outside ChatBody; panels as body siblings; compact top bar.
 */
export function AiosCopilotChatHost({
  run,
  active,
  onPatchRun,
  hideWorkControls,
}: Props): React.JSX.Element {
  const workContext = useRunWorkContext(run.runId);
  const { applyControllerSnapshot } = useChatWorkspace();
  const density = useComposerDensity();
  const viewportTier = useViewportTier();
  const showWorkControls = !hideWorkControls;
  const profileId = run.identity.profileId || "default";
  const sessionId = run.identity.sessionId;

  const runContext = useMemo(
    () =>
      createAiosChatRunContextAdapter({
        getExpertId: () => workContext.selectedExpert?.expertId,
        getTeamId: () => run.context.teamId,
        getSkillName: () =>
          workContext.selectedSkill?.name || run.context.skillName,
        getWorkMode: () => workContext.workMode || run.context.workMode,
        getPermissionMode: () => workContext.permissionMode,
        getPromptHintMode: () => run.presentation.promptHint?.mode,
        getModelId: () => run.presentation.selectedModelId ?? null,
        setExpertId: (id) => {
          if (!id) workContext.clearContext();
          else onPatchRun(run.runId, { context: { expertId: id } });
        },
        setTeamId: (id) => {
          onPatchRun(run.runId, { context: { teamId: id } });
        },
        setSkillName: (name) => {
          onPatchRun(run.runId, { context: { skillName: name } });
        },
        setWorkMode: (mode) => {
          if (mode === "ask" || mode === "plan" || mode === "craft") {
            workContext.setWorkMode(mode);
          }
        },
        setPermissionMode: (mode) => {
          if (mode === "default" || mode === "ask_each_time") {
            workContext.setPermissionMode(mode);
          }
        },
        setPromptHintMode: (mode) => {
          onPatchRun(run.runId, {
            presentation: { promptHint: { mode: mode || "auto" } },
          });
        },
        setModelId: (id) => {
          onPatchRun(run.runId, {
            presentation: { selectedModelId: id ?? undefined },
          });
        },
      }),
    [onPatchRun, run, workContext],
  );

  const filePreview = useFilePreview();

  const sessionFilesVisible = run.presentation.sessionFilesVisible;
  const previewMaximized = run.presentation.previewMaximized;
  const [worktreeVisible, setWorktreeVisible] = useState(false);

  const setSessionFilesVisible = useCallback(
    (visible: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof visible === "function"
          ? visible(run.presentation.sessionFilesVisible)
          : visible;
      onPatchRun(run.runId, {
        presentation: { sessionFilesVisible: next },
      });
      if (next) setWorktreeVisible(false);
    },
    [onPatchRun, run.presentation.sessionFilesVisible, run.runId],
  );

  const setPreviewMaximized = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof value === "function"
          ? value(run.presentation.previewMaximized)
          : value;
      onPatchRun(run.runId, {
        presentation: { previewMaximized: next },
      });
    },
    [onPatchRun, run.presentation.previewMaximized, run.runId],
  );

  const filesSummary = useSessionFilesSummary({
    sessionId,
    profileId,
  });

  const [composerInput, setComposerInput] = useState(
    run.presentation.draft || "",
  );

  useEffect(() => {
    setComposerInput(run.presentation.draft || "");
  }, [run.runId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset draft on run switch only

  const promptHintState: PromptHintState = run.presentation.promptHint ?? {
    mode: "auto",
  };

  const setPromptHintState = useCallback(
    (next: PromptHintState) => {
      onPatchRun(run.runId, { presentation: { promptHint: next } });
    },
    [onPatchRun, run.runId],
  );

  const selectorContext = workContext as unknown as UseWorkChatContextReturn;

  const autoHint = useMemo(() => {
    if (
      !workContext.selectedExpert ||
      !workContext.selectedSkill ||
      !shouldBuildExpertPromptHint({
        expertName: workContext.selectedExpert.name,
        skillName: workContext.selectedSkill.name,
      })
    ) {
      return "";
    }
    return buildExpertPromptHint({
      userMessage: composerInput.trim() || "(empty message)",
      expertName: workContext.selectedExpert.name,
      expertId: workContext.selectedExpert.expertId,
      skillName: workContext.selectedSkill.name,
      permissionMode: workContext.permissionMode,
    });
  }, [
    composerInput,
    workContext.permissionMode,
    workContext.selectedExpert,
    workContext.selectedSkill,
  ]);

  const composeMessage = useCallback(
    (raw: string) => {
      const auto =
        workContext.selectedExpert && workContext.selectedSkill
          ? composeWorkPrompt({
              userMessage: raw,
              selectedExpert: workContext.selectedExpert,
              selectedSkill: workContext.selectedSkill,
              permissionMode: workContext.permissionMode,
            })
          : raw;
      return resolveEffectivePromptHint(promptHintState, auto, raw);
    },
    [
      promptHintState,
      workContext.permissionMode,
      workContext.selectedExpert,
      workContext.selectedSkill,
    ],
  );

  const headerLabel =
    run.context.mode === "team"
      ? run.context.teamName || run.context.teamId || "Team"
      : run.context.mode === "expert"
        ? run.context.expertName || run.context.expertId || "Expert"
        : "Hermes";

  const handleControllerState = useCallback(
    (snapshot: ControllerStateChangeSnapshot) => {
      applyControllerSnapshot(
        {
          runId: run.runId,
          sessionId: snapshot.sessionId,
          runState: snapshot.runState,
          selectedModelId: snapshot.selectedModelId,
          firstUserPrompt: snapshot.firstUserPrompt,
        },
        active,
      );
    },
    [active, applyControllerSnapshot, run.runId],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setComposerInput(value);
      onPatchRun(run.runId, { presentation: { draft: value } });
    },
    [onPatchRun, run.runId],
  );

  const emptyContext = useMemo(() => {
    if (run.context.mode === "team") {
      return {
        teamName: run.context.teamName || run.context.teamId,
        description: "Coordinate with your team on the next deliverable.",
      };
    }
    if (run.context.mode === "expert" && run.context.expertName) {
      const suggestions = run.context.skillName
        ? [
            {
              text: `Use skill ${run.context.skillName} to analyze this`,
              label: run.context.skillDisplayName || run.context.skillName,
            },
            {
              text: `Ask ${run.context.expertName} for a step-by-step plan`,
            },
            {
              text: `Summarize key risks for ${run.context.expertName}`,
            },
          ]
        : undefined;
      return {
        expertName: run.context.expertName,
        description: `Ask ${run.context.expertName} to help with your next task.`,
        suggestions,
      };
    }
    return undefined;
  }, [run.context]);

  const contextPopover = (
    <WorkContextPopover onClear={workContext.clearContext}>
      <GatewayStatusBadge status={workContext.gatewayStatus} />
      <ExpertSelector context={selectorContext} />
      <ExpertSkillSelector context={selectorContext} />
      <PermissionSelector context={selectorContext} />
    </WorkContextPopover>
  );

  const workChip = showWorkControls ? (
    <WorkContextChip
      expertName={workContext.selectedExpert?.name}
      skillName={
        workContext.selectedSkill?.displayName ||
        workContext.selectedSkill?.name
      }
      gatewayStatus={workContext.gatewayStatus}
      density={
        density === "full" ? "full" : density === "expert" ? "expert" : "icon"
      }
    >
      {contextPopover}
    </WorkContextChip>
  ) : null;

  const promptHintControl = showWorkControls ? (
    <PromptAssistPanel
      state={promptHintState}
      autoHint={autoHint}
      density={density === "icon" ? "icon" : "full"}
      onChange={setPromptHintState}
    />
  ) : null;

  const composerControls =
    showWorkControls && density === "icon" ? (
      <div className="aios-work-composer-toolbar aios-work-composer-toolbar--compact">
        {workChip}
        <ComposerMoreMenu>{promptHintControl}</ComposerMoreMenu>
      </div>
    ) : showWorkControls ? (
      <div className="aios-work-composer-toolbar">
        {workChip}
        {promptHintControl}
      </div>
    ) : null;

  // Responsive panel arbitration (PRD §47)
  const showInlineNavigator =
    viewportTier === "wide" && (sessionFilesVisible || worktreeVisible);
  const showInlinePreview =
    (viewportTier === "wide" || viewportTier === "medium") &&
    filePreview.state.open;
  const showOverlayNavigator =
    viewportTier !== "wide" && (sessionFilesVisible || worktreeVisible);
  const showOverlayPreview =
    viewportTier === "narrow" && filePreview.state.open;

  const navigatorPanel = showInlineNavigator ? (
    sessionFilesVisible ? (
      <SessionFilesPanel
        files={aiosFilesAdapter}
        sessionId={sessionId}
        profileId={profileId}
        onPreview={(f: ChatFileRef) => {
          setPreviewMaximized(false);
          void filePreview.openPreview(f.id, profileId);
        }}
        onClose={() => setSessionFilesVisible(false)}
      />
    ) : worktreeVisible ? (
      <WorktreePanel
        sessionId={sessionId}
        profileId={profileId}
        workspace={aiosWorkspaceAdapter}
        onClose={() => setWorktreeVisible(false)}
      />
    ) : null
  ) : null;

  const previewPanel = showInlinePreview ? (
    <FilePreviewPanel
      state={filePreview.state}
      profile={profileId}
      sessionId={sessionId ?? undefined}
      maximized={previewMaximized}
      onToggleMaximized={() => setPreviewMaximized((v) => !v)}
      onClose={() => {
        filePreview.closePreview();
        setPreviewMaximized(false);
      }}
      onRetry={() => filePreview.retry()}
      onLoadMore={() => {
        void filePreview.loadMore();
      }}
      onMessageFileCreated={(fileId) => {
        void filePreview.openPreview(fileId, profileId);
      }}
    />
  ) : null;

  return (
    <>
      <ChatSurface
        runtime={aiosChatRuntimeAdapter}
        session={aiosSessionAdapter}
        files={aiosFilesAdapter}
        models={aiosModelsAdapter}
        navigation={aiosNavigationAdapter}
        commands={aiosCommandAdapter}
        workspace={aiosWorkspaceAdapter}
        runContext={runContext}
        profileId={profileId}
        sessionId={sessionId}
        initialDraft={run.presentation.draft || ""}
        runId={run.runId}
        expertId={run.context.expertId}
        teamId={run.context.teamId}
        expertRunId={run.execution.expertRunId}
        skillName={run.context.skillName}
        workMode={run.context.workMode}
        permissionMode={run.context.permissionMode}
        promptHintMode={run.presentation.promptHint?.mode}
        invocationSource={run.execution.invocationSource}
        composeMessage={composeMessage}
        onInputChange={handleInputChange}
        emptyContext={emptyContext}
        onSessionIdChange={(id) => {
          onPatchRun(run.runId, { identity: { sessionId: id } });
        }}
        onControllerStateChange={handleControllerState}
        topBarSlot={
          showWorkControls ? (
            <ChatRunHeader
              mode={run.context.mode}
              label={headerLabel}
              skillName={run.context.skillName}
              skillDisplayName={run.context.skillDisplayName}
              workMode={run.context.workMode}
              showReturnDefault={run.context.mode !== "default"}
              onReturnDefault={() => workContext.clearContext()}
              onWorkModeChange={(mode) => workContext.setWorkMode(mode)}
            />
          ) : (
            <ChatRunHeader
              mode="default"
              label="Hermes"
              workMode={run.context.workMode}
              onWorkModeChange={(mode) => workContext.setWorkMode(mode)}
            />
          )
        }
        composerControlsSlot={composerControls}
        sessionFilesActive={sessionFilesVisible}
        sessionFilesCount={filesSummary.total}
        onToggleSessionFiles={() => setSessionFilesVisible((v) => !v)}
        navigatorPanel={navigatorPanel}
        previewPanel={previewPanel}
        previewMaximized={previewMaximized && showInlinePreview}
      />

      {(showOverlayNavigator || showOverlayPreview) && (
        <div className="chat-panel-overlay" role="dialog">
          <button
            type="button"
            className="chat-panel-overlay-backdrop"
            aria-label="Close panel"
            onClick={() => {
              setSessionFilesVisible(false);
              setWorktreeVisible(false);
              filePreview.closePreview();
              setPreviewMaximized(false);
            }}
          />
          <div className="chat-panel-overlay-content">
            {showOverlayNavigator &&
              (sessionFilesVisible ? (
                <SessionFilesPanel
                  files={aiosFilesAdapter}
                  sessionId={sessionId}
                  profileId={profileId}
                  onPreview={(f: ChatFileRef) => {
                    setPreviewMaximized(false);
                    void filePreview.openPreview(f.id, profileId);
                  }}
                  onClose={() => setSessionFilesVisible(false)}
                />
              ) : (
                <WorktreePanel
                  sessionId={sessionId}
                  profileId={profileId}
                  workspace={aiosWorkspaceAdapter}
                  onClose={() => setWorktreeVisible(false)}
                />
              ))}
            {showOverlayPreview ? (
              <FilePreviewPanel
                state={filePreview.state}
                profile={profileId}
                sessionId={sessionId ?? undefined}
                maximized={false}
                onClose={() => {
                  filePreview.closePreview();
                  setPreviewMaximized(false);
                }}
                onRetry={() => filePreview.retry()}
                onLoadMore={() => {
                  void filePreview.loadMore();
                }}
                onMessageFileCreated={(fileId) => {
                  void filePreview.openPreview(fileId, profileId);
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

export default AiosCopilotChatHost;
