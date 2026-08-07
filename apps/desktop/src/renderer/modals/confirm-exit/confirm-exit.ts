/**
 * Confirm Exit Modal
 */

interface ConfirmExitData {
  hasUnsavedData?: boolean;
  gatewayRunning: boolean;
}

async function init(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (!window.internalView) {
    console.error("[ConfirmExit] internalView API not available");
    return;
  }

  try {
    const data = (await window.internalView.getData()) as ConfirmExitData | undefined;

    // Update content based on data
    const contentEl = document.getElementById("content");
    if (contentEl && data?.hasUnsavedData) {
      contentEl.textContent =
        "Hermes Gateway is still running with unsaved data. If you exit now, all active sessions and unsaved changes will be lost.";
    }

    // Bind buttons
    document.getElementById("cancelBtn")?.addEventListener("click", () => {
      window.internalView?.close("cancel");
    });

    document.getElementById("minimizeBtn")?.addEventListener("click", () => {
      window.internalView?.close("minimize");
    });

    document.getElementById("exitBtn")?.addEventListener("click", () => {
      window.internalView?.close("exit");
    });

    // ESC key to cancel
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        window.internalView?.close("cancel");
      }
    });

    // Click overlay to cancel
    document.getElementById("overlay")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        window.internalView?.close("cancel");
      }
    });

    await window.internalView.ready();
  } catch (err) {
    console.error("[ConfirmExit] Failed to initialize:", err);
  }
}

init();
