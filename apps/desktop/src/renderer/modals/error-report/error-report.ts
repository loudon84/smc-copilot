/**
 * Error Report Modal
 */

interface ErrorReportData {
  error: string;
  stack?: string;
  context: string;
  timestamp: number;
}

async function init(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (!window.internalView) {
    console.error("[ErrorReport] internalView API not available");
    return;
  }

  try {
    const data = (await window.internalView.getData()) as ErrorReportData | undefined;

    if (data) {
      // Update error summary
      const summaryEl = document.getElementById("errorSummary");
      if (summaryEl) {
        summaryEl.textContent = data.error;
      }

      // Update context
      const contextEl = document.getElementById("errorContext");
      if (contextEl) {
        const date = new Date(data.timestamp).toLocaleString();
        contextEl.textContent = `Context: ${data.context} | Time: ${date}`;
      }

      // Update stack trace
      const stackEl = document.getElementById("stackTrace");
      if (stackEl && data.stack) {
        stackEl.textContent = data.stack;
      }
    }

    // Toggle stack trace visibility
    const toggleEl = document.getElementById("stackToggle");
    const stackEl = document.getElementById("stackTrace");
    if (toggleEl && stackEl) {
      toggleEl.addEventListener("click", () => {
        const isVisible = stackEl.classList.toggle("visible");
        toggleEl.textContent = isVisible ? "Hide details" : "Show details";
      });
    }

    // Bind buttons
    document.getElementById("dismissBtn")?.addEventListener("click", () => {
      window.internalView?.close("dismiss");
    });

    document.getElementById("restartBtn")?.addEventListener("click", () => {
      window.internalView?.close("restart");
    });

    // ESC key to dismiss
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        window.internalView?.close("dismiss");
      }
    });

    await window.internalView.ready();
  } catch (err) {
    console.error("[ErrorReport] Failed to initialize:", err);
  }
}

init();
