import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { FileViewer } from "@open-file-viewer/react";
import { officePlugin } from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";

const FIXTURES = {
  "DOC-01": "/DOC-01-tier-b.docx",
  "DOC-02": "/DOC-02-long.docx",
  "XLS-01": "/XLS-01-multi-sheet.xlsx",
  "PPT-01": "/PPT-01-two-slides.pptx",
};

const params = new URLSearchParams(window.location.search);
const engine = params.get("engine") || "open-file-viewer";
const fixture = params.get("fixture") || "DOC-01";

export function App() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const hostRef = useRef(null);

  useEffect(() => {
    const url = FIXTURES[fixture];
    if (!url) {
      setError(`unknown fixture ${fixture}`);
      return;
    }
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url} ${r.status}`);
        return r.blob();
      })
      .then(async (blob) => {
        if (cancelled) return;
        const named = new File(
          [blob],
          url.split("/").pop() || "sample.bin",
          { type: blob.type || "application/octet-stream" },
        );
        setFile(named);
        if (engine === "docx-preview") {
          const buf = await named.arrayBuffer();
          if (!hostRef.current) return;
          hostRef.current.innerHTML = "";
          await renderAsync(buf, hostRef.current, undefined, {
            breakPages: true,
            experimental: true,
          });
        }
        setReady(true);
      })
      .catch((err) => setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-engine={engine} data-fixture={fixture} data-ready={ready ? "1" : "0"}>
      <header style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
        <strong>office-engine spike</strong> · {engine} · {fixture}
        {error ? <span data-testid="spike-error"> {error}</span> : null}
      </header>
      {engine === "open-file-viewer" && file ? (
        <div data-testid="ofv-host" style={{ height: "calc(100vh - 40px)" }}>
          <FileViewer
            file={file}
            fileName={file.name}
            plugins={[officePlugin()]}
          />
        </div>
      ) : null}
      {engine === "docx-preview" ? (
        <div
          ref={hostRef}
          data-testid="docx-preview-host"
          style={{ padding: 16, overflow: "auto", height: "calc(100vh - 40px)" }}
        />
      ) : null}
    </div>
  );
}
