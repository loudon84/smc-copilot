import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { OpenFileViewerAdapter } from "./adapters/open-file-viewer";
import { FilePreviewContainer } from "./FilePreviewContainer";
import { FilePreviewLoading } from "./FilePreviewLoading";
import { FilePreviewToolbar } from "./FilePreviewToolbar";
import {
  createHttpFileProvider,
  type HttpFileProviderDeps,
} from "./providers/HttpFileProvider";
import {
  createKnowledgeFileProvider,
  type KnowledgeFileProviderDeps,
} from "./providers/KnowledgeFileProvider";
import {
  createLocalFileProvider,
  type LocalFileProviderDeps,
} from "./providers/LocalFileProvider";
import { isPreviewable } from "./registry/preview-registry";
import type {
  FilePreviewLoadPhase,
  FilePreviewProvider,
  FilePreviewSource,
  ResolvedPreviewFile,
} from "./types";
import { filePreviewSourceIdentity } from "./types";

export type FilePreviewProps = {
  source: FilePreviewSource;
  /** When true, Knowledge provider force-refreshes materialize cache. */
  forceRefresh?: boolean;
  /** Prefix for data-testid attributes (default: file-preview). */
  testIdPrefix?: string;
  /** Optional container class (e.g. fill parent height in detail layout). */
  className?: string;
  localDeps?: LocalFileProviderDeps;
  httpDeps?: HttpFileProviderDeps;
  knowledgeDeps?: KnowledgeFileProviderDeps;
  /** Override provider map (tests). */
  providers?: Partial<Record<FilePreviewSource["type"], FilePreviewProvider>>;
};

type LoadState =
  | { status: "loading"; phase: FilePreviewLoadPhase }
  | { status: "unavailable"; message?: string }
  | { status: "error"; message: string }
  | { status: "ready"; resolved: ResolvedPreviewFile };

function initialPhase(type: FilePreviewSource["type"]): FilePreviewLoadPhase {
  return type === "local" ? "prepare" : "download";
}

export function FilePreview({
  source,
  forceRefresh = false,
  testIdPrefix = "file-preview",
  className,
  localDeps,
  httpDeps,
  knowledgeDeps,
  providers: providerOverrides,
}: FilePreviewProps): ReactElement {
  const [state, setState] = useState<LoadState>({
    status: "loading",
    phase: initialPhase(source.type),
  });
  const [refreshNonce, setRefreshNonce] = useState(0);

  const providers = useMemo(() => {
    return {
      local: providerOverrides?.local ?? createLocalFileProvider(localDeps),
      url: providerOverrides?.url ?? createHttpFileProvider(httpDeps),
      knowledge:
        providerOverrides?.knowledge ??
        createKnowledgeFileProvider(knowledgeDeps),
    };
  }, [providerOverrides, localDeps, httpDeps, knowledgeDeps]);

  // Value identity — inline `source={{…}}` from parents must not retrigger load.
  const sourceKey = filePreviewSourceIdentity(source);

  const load = useCallback(async () => {
    setState({ status: "loading", phase: initialPhase(source.type) });
    const provider = providers[source.type];
    if (!provider) {
      setState({ status: "error", message: "NO_PROVIDER" });
      return;
    }
    const result = await provider.resolve(source, {
      forceRefresh: forceRefresh || refreshNonce > 0,
      onPhase: (phase) => {
        setState((prev) =>
          prev.status === "loading" ? { status: "loading", phase } : prev,
        );
      },
    });
    if (!result.ok) {
      if (result.reason === "unavailable") {
        setState({ status: "unavailable", message: result.message });
        return;
      }
      setState({
        status: "error",
        message: result.message ?? "PREVIEW_FAILED",
      });
      return;
    }
    if (!isPreviewable(result.resolved.format)) {
      setState({
        status: "error",
        message: `UNSUPPORTED_FORMAT ${result.resolved.format}`,
      });
      return;
    }
    setState({ status: "ready", resolved: result.resolved });
    // Depend on sourceKey (value identity), not `source` object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- source covered by sourceKey
  }, [providers, sourceKey, forceRefresh, refreshNonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRetry = () => {
    setRefreshNonce((n) => n + 1);
  };

  return (
    <FilePreviewContainer className={className}>
      <FilePreviewToolbar
        fileName={source.name}
        onRetry={
          state.status === "error" || state.status === "unavailable"
            ? onRetry
            : undefined
        }
      />
      {state.status === "loading" ? (
        <FilePreviewLoading
          phase={state.phase}
          fileName={source.name}
          testId={`${testIdPrefix}-loading`}
        />
      ) : null}
      {state.status === "unavailable" ? (
        <p
          className="px-3 py-4 text-sm text-muted-foreground"
          data-testid={`${testIdPrefix}-unavailable`}
        >
          Preview unavailable
        </p>
      ) : null}
      {state.status === "error" ? (
        <div className="px-3 py-4" data-testid={`${testIdPrefix}-error`}>
          <p className="text-sm text-destructive">{state.message}</p>
          <button
            type="button"
            data-testid={`${testIdPrefix}-retry`}
            className="mt-2 text-sm underline"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <div
          className="min-h-0 flex-1 overflow-hidden"
          data-testid={`${testIdPrefix}-ready`}
        >
          <OpenFileViewerAdapter
            file={state.resolved.file}
            fileName={state.resolved.fileName}
          />
        </div>
      ) : null}
    </FilePreviewContainer>
  );
}
