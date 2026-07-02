import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpertTaskEvent } from "../../../../../../../shared/hermes-experts/expert-task-stream-contract";
import type {
  ExpertTaskArtifactView,
  ExpertTaskTimelineEntry,
  ExpertTaskTimelineStatus,
} from "../../../types/expert-task-stream";

function expertsApi(): NonNullable<typeof window.hermesExperts> {
  if (!window.hermesExperts) {
    throw new Error("window.hermesExperts is not available");
  }
  return window.hermesExperts;
}

function deriveStatus(
  events: ExpertTaskEvent[],
  current: ExpertTaskTimelineStatus,
): ExpertTaskTimelineStatus {
  if (events.some((e) => e.type === "task.failed")) return "failed";
  if (events.some((e) => e.type === "task.completed")) return "completed";
  if (events.some((e) => e.type === "task.started" || e.type === "task.progress")) return "running";
  return current;
}

export function useExpertTaskStream() {
  const [timelines, setTimelines] = useState<ExpertTaskTimelineEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ExpertTaskArtifactView[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<ExpertTaskArtifactView | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const activeTaskIdsRef = useRef<Set<string>>(new Set());

  const upsertTimeline = useCallback((entry: ExpertTaskTimelineEntry) => {
    setTimelines((prev) => {
      const idx = prev.findIndex((t) => t.taskId === entry.taskId);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = { ...next[idx], ...entry };
      return next;
    });
  }, []);

  const appendEvent = useCallback((event: ExpertTaskEvent) => {
    setTimelines((prev) => {
      const idx = prev.findIndex((t) => t.taskId === event.taskId);
      if (idx === -1) return prev;
      const current = prev[idx];
      const events = [...current.events, event];
      const next = [...prev];
      next[idx] = {
        ...current,
        events,
        status: deriveStatus(events, current.status),
      };
      return next;
    });

    if (event.type === "task.artifact.ready") {
      const artifact: ExpertTaskArtifactView = {
        taskId: event.taskId,
        artifactId: event.artifactId,
        artifactUrl: event.artifactUrl,
        name: event.name ?? event.artifactId ?? "Artifact",
        mimeType: event.mimeType,
      };
      setArtifacts((prev) => {
        const exists = prev.some(
          (a) =>
            a.taskId === artifact.taskId &&
            ((artifact.artifactId && a.artifactId === artifact.artifactId) ||
              (artifact.artifactUrl && a.artifactUrl === artifact.artifactUrl)),
        );
        return exists ? prev : [...prev, artifact];
      });
    }
  }, []);

  const startStream = useCallback(
    async (input: {
      taskId: string;
      taskNo?: string;
      eventSseUrl: string;
      artifactUrl?: string;
      expertName?: string;
      skillName?: string;
      runId?: string;
    }) => {
      activeTaskIdsRef.current.add(input.taskId);
      upsertTimeline({
        taskId: input.taskId,
        taskNo: input.taskNo,
        expertName: input.expertName,
        skillName: input.skillName,
        status: "accepted",
        events: [],
        eventSseUrl: input.eventSseUrl,
        artifactUrl: input.artifactUrl,
        runId: input.runId,
      });

      await expertsApi().subscribeExpertTaskEvents({
        taskId: input.taskId,
        taskNo: input.taskNo,
        eventSseUrl: input.eventSseUrl,
        artifactUrl: input.artifactUrl,
      });
    },
    [upsertTimeline],
  );

  const stopStream = useCallback(async (taskId: string) => {
    activeTaskIdsRef.current.delete(taskId);
    await expertsApi().unsubscribeExpertTaskEvents(taskId);
  }, []);

  const previewArtifact = useCallback(async (artifact: ExpertTaskArtifactView) => {
    setSelectedArtifact(artifact);
    setPreviewLoading(true);
    setPreviewContent(null);
    try {
      const result = await expertsApi().previewExpertArtifact({
        artifactId: artifact.artifactId,
        artifactUrl: artifact.artifactUrl,
        taskId: artifact.taskId,
      });
      if (result.ok && result.data?.text != null) {
        setPreviewContent(result.data.text);
      } else {
        setPreviewContent(result.ok ? "Preview failed" : (result.error ?? "Preview failed"));
      }
    } catch (err) {
      setPreviewContent(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const downloadArtifact = useCallback(async (artifact: ExpertTaskArtifactView) => {
    return expertsApi().downloadExpertArtifact({
      artifactId: artifact.artifactId,
      artifactUrl: artifact.artifactUrl,
      taskId: artifact.taskId,
    });
  }, []);

  useEffect(() => {
    const api = window.hermesExperts;
    if (!api) return undefined;

    const unsubEvent = api.onExpertTaskEvent((event) => {
      appendEvent(event);
    });
    const unsubError = api.onExpertTaskStreamError((error) => {
      setTimelines((prev) =>
        prev.map((t) =>
          t.taskId === error.taskId
            ? {
                ...t,
                status: "failed",
                events: [
                  ...t.events,
                  {
                    type: "task.failed",
                    taskId: error.taskId,
                    error: error.error,
                    errorCode: error.errorCode,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : t,
        ),
      );
    });
    const unsubClosed = api.onExpertTaskStreamClosed((event) => {
      void stopStream(event.taskId);
    });

    return () => {
      unsubEvent();
      unsubError();
      unsubClosed();
      for (const taskId of activeTaskIdsRef.current) {
        void api.unsubscribeExpertTaskEvents(taskId);
      }
      activeTaskIdsRef.current.clear();
    };
  }, [appendEvent, stopStream]);

  return {
    timelines,
    artifacts,
    selectedArtifact,
    previewContent,
    previewLoading,
    startStream,
    stopStream,
    previewArtifact,
    downloadArtifact,
    setSelectedArtifact,
  };
}
