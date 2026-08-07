import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AIOSSkillToolCall } from "../../types";

export function ActivityRow({ tool }: { tool: AIOSSkillToolCall }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="workspaces-webchat-activity">
      <button
        type="button"
        className="workspaces-webchat-activity-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{tool.name}</span>
        <span className="workspaces-webchat-activity-status">{tool.status}</span>
      </button>
      {open && tool.resultPreview ? (
        <pre className="workspaces-webchat-activity-body">{tool.resultPreview}</pre>
      ) : null}
    </div>
  );
}
