/**
 * Register hermes-artifact:// for sandboxed HTML preview host pages.
 * Must call registerArtifactSchemePrivileged() before app ready.
 */

import { protocol } from "electron";
import { existsSync, readFileSync } from "fs";
import { extname, join, normalize } from "path";

export const ARTIFACT_SCHEME = "hermes-artifact";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Call before `app.whenReady()` so the scheme is privileged. */
export function registerArtifactSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ARTIFACT_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function previewRoot(): string {
  // electron-vite copies resources next to the app; prefer process.resourcesPath
  // in packaged builds and repo resources/ in development.
  const candidates = [
    join(process.resourcesPath || "", "artifact-preview"),
    join(__dirname, "../../resources/artifact-preview"),
    join(process.cwd(), "resources/artifact-preview"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  return candidates[candidates.length - 1];
}

/**
 * Register protocol handler after app ready. Serves only files under
 * resources/artifact-preview (no path traversal).
 */
export function registerArtifactProtocolHandler(): void {
  const root = previewRoot();
  protocol.handle(ARTIFACT_SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname || "/").replace(/^\/+/, "");
      if (!rel || rel.endsWith("/")) rel = "index.html";
      const full = normalize(join(root, rel));
      if (!full.startsWith(normalize(root))) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!existsSync(full)) {
        return new Response("Not found", { status: 404 });
      }
      const body = readFileSync(full);
      const mime = MIME[extname(full).toLowerCase()] || "application/octet-stream";
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Security-Policy":
            "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none';",
        },
      });
    } catch (err) {
      return new Response(
        err instanceof Error ? err.message : "Artifact host error",
        { status: 500 },
      );
    }
  });
}

/** Stable preview host URL for ArtifactFrame iframes. */
export function artifactPreviewHostUrl(): string {
  return `${ARTIFACT_SCHEME}://preview/index.html`;
}
