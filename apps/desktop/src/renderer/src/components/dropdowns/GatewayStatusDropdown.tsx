import { useState } from "react";
import { Loader2, Play, Square, RotateCw } from "lucide-react";
import {
  AnchoredDropdown,
  computeAnchoredPosition,
} from "./dropdown-shared";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

interface GatewayStatusData {
  running: boolean;
  profile: string;
  mode: "local" | "remote" | "ssh";
  port?: number;
  lastError?: string;
}

export interface GatewayStatusDropdownProps {
  visible: boolean;
  position: { x: number; y: number };
  data: GatewayStatusData;
  onClose: () => void;
}

export function GatewayStatusDropdown({
  visible,
  position: anchorPoint,
  data,
  onClose,
}: GatewayStatusDropdownProps): React.JSX.Element | null {
  const [isLoading, setIsLoading] = useState(false);

  if (!visible) return null;

  const anchorBounds = {
    x: anchorPoint.x,
    y: anchorPoint.y,
    width: 0,
    height: 0,
  };

  const panelPosition = computeAnchoredPosition(anchorBounds, {
    width: 260,
    estimatedHeight: data.lastError ? 220 : 180,
  });

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
      onClose();
    }
  };

  return (
    <AnchoredDropdown
      anchorBounds={anchorBounds}
      position={{ ...panelPosition, x: anchorPoint.x, y: anchorPoint.y }}
      maxHeight={280}
      onClose={onClose}
    >
      <DropdownMenuLabel className="flex items-center gap-2 border-b border-[var(--border-bright)]">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            data.running ? "bg-[var(--success)]" : "bg-[var(--text-muted)]",
          )}
        />
        {data.running ? "Gateway running" : "Gateway stopped"}
      </DropdownMenuLabel>

      <div className="space-y-1 px-2 py-2 text-xs text-[var(--text-secondary)]">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--text-muted)]">Profile</span>
          <span className="font-medium text-[var(--text-primary)]">{data.profile}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--text-muted)]">Mode</span>
          <span className="font-medium text-[var(--text-primary)]">{data.mode}</span>
        </div>
        {data.port ? (
          <div className="flex justify-between gap-2">
            <span className="text-[var(--text-muted)]">Port</span>
            <span className="font-mono text-[var(--text-primary)]">{data.port}</span>
          </div>
        ) : null}
      </div>

      {data.lastError ? (
        <>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs text-[var(--error)]">
            <span className="font-medium">Error: </span>
            {data.lastError}
          </div>
        </>
      ) : null}

      <DropdownMenuSeparator />
      {data.running ? (
        <>
          <DropdownMenuItem
            disabled={isLoading}
            onClick={() =>
              void runAction(async () => {
                await window.hermesAPI.stopGateway();
              })
            }
          >
            <Square size={16} className="text-[var(--text-muted)]" />
            {isLoading ? "Stopping…" : "Stop"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isLoading}
            onClick={() =>
              void runAction(async () => {
                await window.hermesAPI.stopGateway();
                await window.hermesAPI.startGateway();
              })
            }
          >
            <RotateCw size={16} className="text-[var(--text-muted)]" />
            {isLoading ? "Restarting…" : "Restart"}
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem
          disabled={isLoading}
          onClick={() =>
            void runAction(async () => {
              await window.hermesAPI.startGateway();
            })
          }
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin text-[var(--accent-text)]" />
          ) : (
            <Play size={16} className="text-[var(--text-muted)]" />
          )}
          {isLoading ? "Starting…" : "Start"}
        </DropdownMenuItem>
      )}
    </AnchoredDropdown>
  );
}
