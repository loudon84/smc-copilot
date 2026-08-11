/**
 * Sandboxed artifact preview host.
 * Accepts only structured postMessage payloads from the parent window
 * with a fixed channel/version/type schema and origin checks.
 */
(function () {
  "use strict";

  var CHANNEL = "hermes-artifact";
  var VERSION = 1;

  /**
   * Origins we accept from the desktop shell. Opaque ("null") covers
   * sandboxed srcDoc/blob parents that cannot advertise a real origin.
   */
  var ALLOWED_ORIGINS = {
    null: true,
    "http://localhost:5173": true,
    "http://127.0.0.1:5173": true,
    "app://hermes-artifact": true,
    "hermes-artifact://preview": true,
  };

  function originAllowed(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS[origin]) return true;
    // Dev / preview servers on localhost with any port.
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
    // Packaged file:// loads (Electron unpack of resources/).
    if (origin === "file://" || origin.indexOf("file://") === 0) {
      return true;
    }
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
    // Parse into a template so we don't execute via innerHTML assignment
    // of a full document; scripts inside the artifact still run because
    // the iframe has allow-scripts (intentional for HTML artifacts).
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

  // Ready handshake so the parent can post immediately after load.
  try {
    window.parent.postMessage(
      { channel: CHANNEL, version: VERSION, type: "ready" },
      "*",
    );
  } catch (_) {
    /* parent may be gone */
  }
})();
