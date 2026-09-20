/**
 * Lazy Chunk image — IntersectionObserver rootMargin 200px; Blob URL lifecycle;
 * global in-flight ≤ 3. Failures stay item-local.
 * Thumbnail box is fixed 128×120 (inline styles) for Hybrid card「缩略图 | 文案」.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/tailwind";
import type { KnowledgeFileChunkImageResult } from "../../../src/shared/knowledge/knowledge-base-ipc";
import { withChunkImageConcurrency } from "./chunkImageConcurrency";

export type ChunkImageLoadState =
  | "IDLE"
  | "OBSERVING"
  | "LOADING"
  | "READY"
  | "EMPTY"
  | "ERROR"
  | "REVOKED";

const THUMB_STYLE: CSSProperties = {
  width: 128,
  height: 120,
  maxWidth: 128,
  maxHeight: 120,
  flexShrink: 0,
};

const THUMB_IMG_STYLE: CSSProperties = {
  width: 128,
  height: 120,
  maxWidth: 128,
  maxHeight: 120,
  objectFit: "contain",
};

type ChunkImageProps = {
  t: (key: string) => string;
  chunkId: string;
  hasImage: boolean;
  loadImage: (chunkId: string) => Promise<KnowledgeFileChunkImageResult>;
  /** Bumped on page/reload to revoke and re-observe. */
  reloadToken: string;
};

export function ChunkImage({
  t,
  chunkId,
  hasImage,
  loadImage,
  reloadToken,
}: ChunkImageProps): ReactElement | null {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const retriedRef = useRef(false);
  const loadGenRef = useRef(0);
  const [state, setState] = useState<ChunkImageLoadState>(
    hasImage ? "OBSERVING" : "IDLE",
  );
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const revoke = (): void => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
  };

  useEffect(() => {
    loadGenRef.current += 1;
    revoke();
    retriedRef.current = false;
    setVisible(false);
    setState(hasImage ? "OBSERVING" : "IDLE");
    return () => {
      loadGenRef.current += 1;
      revoke();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadToken drives reset
  }, [chunkId, hasImage, reloadToken]);

  useEffect(() => {
    if (!hasImage || state !== "OBSERVING") return;
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasImage, state, chunkId, reloadToken]);

  useEffect(() => {
    if (!hasImage || !visible) return;
    const gen = ++loadGenRef.current;
    setState("LOADING");
    void (async () => {
      try {
        const result = await withChunkImageConcurrency(() => loadImage(chunkId));
        if (gen !== loadGenRef.current) return;
        if (!result.bytes || result.bytes.byteLength === 0) {
          setState("EMPTY");
          return;
        }
        const copy = new Uint8Array(result.bytes);
        const blob = new Blob([copy], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        if (gen !== loadGenRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        revoke();
        objectUrlRef.current = url;
        setObjectUrl(url);
        setState("READY");
      } catch {
        if (gen !== loadGenRef.current) return;
        setState("ERROR");
      }
    })();
  }, [hasImage, visible, chunkId, loadImage, reloadToken]);

  if (!hasImage) return null;

  const onRetry = (): void => {
    if (retriedRef.current) return;
    retriedRef.current = true;
    const gen = ++loadGenRef.current;
    revoke();
    setState("LOADING");
    void (async () => {
      try {
        const result = await withChunkImageConcurrency(() => loadImage(chunkId));
        if (gen !== loadGenRef.current) return;
        if (!result.bytes || result.bytes.byteLength === 0) {
          setState("EMPTY");
          return;
        }
        const copy = new Uint8Array(result.bytes);
        const blob = new Blob([copy], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        if (gen !== loadGenRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setObjectUrl(url);
        setState("READY");
      } catch {
        if (gen !== loadGenRef.current) return;
        setState("ERROR");
      }
    })();
  };

  return (
    <div
      ref={hostRef}
      style={THUMB_STYLE}
      className={cn(
        "flex items-center justify-center overflow-hidden rounded border border-border bg-muted/30",
      )}
      data-testid={`knowledge-chunk-image-${chunkId}`}
      data-state={state}
    >
      {state === "LOADING" || state === "OBSERVING" ? (
        <span className="p-1 text-center text-[10px] text-muted-foreground">
          {t("knowledge.chunk.imageLoading")}
        </span>
      ) : null}
      {state === "READY" && objectUrl ? (
        <img
          src={objectUrl}
          alt=""
          loading="lazy"
          style={THUMB_IMG_STYLE}
          data-testid={`knowledge-chunk-image-img-${chunkId}`}
        />
      ) : null}
      {state === "EMPTY" ? (
        <span className="p-1 text-center text-[10px] text-muted-foreground">
          {t("knowledge.chunk.imageEmpty")}
        </span>
      ) : null}
      {state === "ERROR" ? (
        <div className="flex flex-col items-center gap-1 p-1">
          <span className="text-center text-[10px] text-muted-foreground">
            {t("knowledge.chunk.imageError")}
          </span>
          {!retriedRef.current ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              data-testid={`knowledge-chunk-image-retry-${chunkId}`}
              onClick={onRetry}
            >
              {t("knowledge.chunk.imageRetry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
