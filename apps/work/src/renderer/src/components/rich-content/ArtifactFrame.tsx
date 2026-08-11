import { useCallback, useEffect, useRef, useState } from "react";
import {
  ARTIFACT_CHANNEL,
  ARTIFACT_HOST_URL,
  ARTIFACT_VERSION,
  buildArtifactHostSrcDoc,
  buildArtifactRenderMessage,
} from "./artifact-host";

export interface ArtifactFrameProps {
  /** Full HTML document or fragment to render inside the sandbox. */
  html: string;
  /** Stable id for this artifact instance (used in postMessage). */
  artifactId: string;
  /** When false the iframe is torn down (Stop). */
  active?: boolean;
  className?: string;
}

/**
 * Sandboxed HTML preview frame. Prefers `hermes-artifact://` host; falls
 * back to inlined `srcDoc` when the protocol host is unavailable.
 * Sandbox is `allow-scripts allow-forms` without `allow-same-origin`.
 */
export function ArtifactFrame({
  html,
  artifactId,
  active = true,
  className,
}: ArtifactFrameProps): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [hostSrcDoc] = useState(() => buildArtifactHostSrcDoc());
  const [useSrcDoc, setUseSrcDoc] = useState(false);

  const postRender = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(buildArtifactRenderMessage(artifactId, html), "*");
  }, [artifactId, html]);

  useEffect(() => {
    if (!active) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = (): void => {
      postRender();
    };
    iframe.addEventListener("load", onLoad);

    const onError = (): void => {
      // Protocol host missing — fall back to srcDoc once.
      setUseSrcDoc(true);
    };
    iframe.addEventListener("error", onError);

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (
        data &&
        typeof data === "object" &&
        data.channel === ARTIFACT_CHANNEL &&
        data.version === ARTIFACT_VERSION &&
        data.type === "ready"
      ) {
        postRender();
      }
    };
    window.addEventListener("message", onMessage);

    try {
      if (iframe.contentDocument?.readyState === "complete") {
        postRender();
      }
    } catch {
      // Opaque origin — wait for load/ready.
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
      window.removeEventListener("message", onMessage);
    };
  }, [active, postRender, useSrcDoc]);

  if (!active) {
    return (
      <div
        className={`rich-artifact-frame rich-artifact-frame--stopped ${className ?? ""}`.trim()}
      >
        Preview stopped
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      className={`rich-artifact-frame ${className ?? ""}`.trim()}
      title={`Artifact ${artifactId}`}
      sandbox="allow-scripts allow-forms"
      {...(useSrcDoc
        ? { srcDoc: hostSrcDoc }
        : { src: ARTIFACT_HOST_URL })}
      // No allow-same-origin — intentional. No Node/Electron exposure.
    />
  );
}
