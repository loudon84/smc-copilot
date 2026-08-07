import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HermesToolCall } from "../../types";

export function ActivityRow({ tool }: { tool: HermesToolCall }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="hermes-webchat-activity">
      <button
        type="button"
        className="hermes-webchat-activity-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{tool.name}</span>
        <span className="hermes-webchat-activity-status">{tool.status}</span>
      </button>
      {open && tool.resultPreview ? (
        <pre className="hermes-webchat-activity-body">{tool.resultPreview}</pre>
      ) : null}
    </div>
  );
}

