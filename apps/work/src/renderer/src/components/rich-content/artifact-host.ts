/**
 * Builds the sandboxed artifact preview host document used as iframe
 * `srcDoc` fallback when `hermes-artifact://` is unavailable. Mirrors
 * `resources/artifact-preview/` so postMessage behaviour stays consistent.
 */

export const ARTIFACT_CHANNEL = "hermes-artifact";
export const ARTIFACT_VERSION = 1;
/** Primary iframe host URL (Main registers the protocol). */
export const ARTIFACT_HOST_URL = "hermes-artifact://preview/index.html";

/** CSP that blocks external network while allowing inline artifact scripts/styles. */
export const ARTIFACT_PREVIEW_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none';";

const PREVIEW_CSS =
  'html,body{margin:0;padding:0;min-height:100%;background:#fff;color:#111;font-family:system-ui,-apple-system,Segoe UI,sans-serif}#root{min-height:100vh;box-sizing:border-box}#root:empty::before{content:"Waiting for artifact…";display:block;padding:16px;color:#666;font-size:13px}';

/**
 * Inlined copy of resources/artifact-preview/preview.js — keep origin
 * checks and message schema in sync with that file.
 */
const PREVIEW_JS = `(function () {
  "use strict";
  var CHANNEL = "${ARTIFACT_CHANNEL}";
  var VERSION = ${ARTIFACT_VERSION};
  var ALLOWED_ORIGINS = {
    "null": true,
    "http://localhost:5173": true,
    "http://127.0.0.1:5173": true,
    "app://hermes-artifact": true,
    "hermes-artifact://preview": true
  };
  function originAllowed(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS[origin]) return true;
    if (/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(origin)) return true;
    if (origin === "file://" || origin.indexOf("file://") === 0) return true;
    return false;
  }
  function isRenderMessage(data) {
    return (
      data &&
      typeof data === "object" &&
      data.channel === CHANNEL &&
      data.version === VERSION &&
      data.type === "render" &&
      typeof data.artifactId === "string" &&
      typeof data.html === "string"
    );
  }
  function renderHtml(html) {
    var root = document.getElementById("root");
    if (!root) return;
    root.replaceChildren();
    var range = document.createRange();
    range.selectNode(root);
    var frag = range.createContextualFragment(html);
    root.appendChild(frag);
  }
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    if (!originAllowed(event.origin)) return;
    if (!isRenderMessage(event.data)) return;
    try {
      renderHtml(event.data.html);
    } catch (err) {
      var root = document.getElementById("root");
      if (root) {
        root.textContent =
          "Artifact render failed: " +
          (err && err.message ? err.message : String(err));
      }
    }
  });
  try {
    window.parent.postMessage(
      { channel: CHANNEL, version: VERSION, type: "ready" },
      "*"
    );
  } catch (_) {}
})();`;

/** Full host document for iframe `srcDoc` (CSP meta + inlined CSS/JS). */
export function buildArtifactHostSrcDoc(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_PREVIEW_CSP}"/><title>Hermes Artifact Preview</title><style>${PREVIEW_CSS}</style></head><body><div id="root"></div><script>${PREVIEW_JS}</script></body></html>`;
}

export interface ArtifactRenderMessage {
  channel: typeof ARTIFACT_CHANNEL;
  version: typeof ARTIFACT_VERSION;
  type: "render";
  artifactId: string;
  html: string;
}

export function buildArtifactRenderMessage(
  artifactId: string,
  html: string,
): ArtifactRenderMessage {
  return {
    channel: ARTIFACT_CHANNEL,
    version: ARTIFACT_VERSION,
    type: "render",
    artifactId,
    html,
  };
}
