/**
 * Quick Actions Dropdown — anchored panel with portal dropdown-menu styles.
 */
import { useMemo } from "react";
import {
  Plus,
  Settings,
  Moon,
  Sun,
  Keyboard,
  HelpCircle,
  LogOut,
  Bug,
  FileText,
  RefreshCw,
  Power,
} from "lucide-react";
import {
  AnchoredDropdown,
  computeAnchoredPosition,
  type AnchorBounds,
} from "./dropdown-shared";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "../ui/dropdown-menu";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

export interface QuickActionsDropdownProps {
  anchorBounds: AnchorBounds;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  onOpenHelp: () => void;
  onRestartGateway: () => void;
  onStopGateway: () => void;
  onReportIssue: () => void;
  onViewLogs: () => void;
  onQuit: () => void;
  isDarkMode?: boolean;
  gatewayRunning?: boolean;
}

export function QuickActionsDropdown({
  anchorBounds,
  onClose,
  onNewChat,
  onOpenSettings,
  onToggleTheme,
  onOpenShortcuts,
  onOpenHelp,
  onRestartGateway,
  onStopGateway,
  onReportIssue,
  onViewLogs,
  onQuit,
  isDarkMode = false,
  gatewayRunning = false,
}: QuickActionsDropdownProps): React.JSX.Element {
  const actions: QuickAction[] = [
    {
      id: "new-chat",
      label: "New Chat",
      icon: <Plus size={16} />,
      shortcut: "⌘N",
      onClick: () => {
        onNewChat();
        onClose();
      },
    },
    { id: "divider-1", label: "", icon: null, onClick: () => {}, divider: true },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings size={16} />,
      shortcut: "⌘,",
      onClick: () => {
        onOpenSettings();
        onClose();
      },
    },
    {
      id: "theme",
      label: isDarkMode ? "Light Mode" : "Dark Mode",
      icon: isDarkMode ? <Sun size={16} /> : <Moon size={16} />,
      shortcut: "⌘⇧L",
      onClick: () => {
        onToggleTheme();
        onClose();
      },
    },
    {
      id: "shortcuts",
      label: "Keyboard Shortcuts",
      icon: <Keyboard size={16} />,
      onClick: () => {
        onOpenShortcuts();
        onClose();
      },
    },
    { id: "divider-2", label: "", icon: null, onClick: () => {}, divider: true },
    {
      id: "gateway-restart",
      label: "Restart Gateway",
      icon: <RefreshCw size={16} />,
      onClick: () => {
        onRestartGateway();
        onClose();
      },
    },
    {
      id: "gateway-stop",
      label: gatewayRunning ? "Stop Gateway" : "Start Gateway",
      icon: <Power size={16} />,
      onClick: () => {
        if (gatewayRunning) {
          onStopGateway();
        }
        onClose();
      },
    },
    { id: "divider-3", label: "", icon: null, onClick: () => {}, divider: true },
    {
      id: "logs",
      label: "View Logs",
      icon: <FileText size={16} />,
      onClick: () => {
        onViewLogs();
        onClose();
      },
    },
    {
      id: "report",
      label: "Report Issue",
      icon: <Bug size={16} />,
      onClick: () => {
        onReportIssue();
        onClose();
      },
    },
    {
      id: "help",
      label: "Help & Support",
      icon: <HelpCircle size={16} />,
      onClick: () => {
        onOpenHelp();
        onClose();
      },
    },
    { id: "divider-4", label: "", icon: null, onClick: () => {}, divider: true },
    {
      id: "quit",
      label: "Quit",
      icon: <LogOut size={16} />,
      shortcut: "⌘Q",
      onClick: () => {
        onQuit();
      },
      danger: true,
    },
  ];

  const position = useMemo(
    () =>
      computeAnchoredPosition(anchorBounds, {
        width: 240,
        estimatedHeight: actions.length * 32 + 16,
        alignEnd: true,
      }),
    [anchorBounds, actions.length],
  );

  return (
    <AnchoredDropdown
      anchorBounds={anchorBounds}
      position={position}
      maxHeight={520}
      onClose={onClose}
      className="py-1"
    >
      {actions.map((action) => {
        if (action.divider) {
          return <DropdownMenuSeparator key={action.id} />;
        }

        return (
          <DropdownMenuItem
            key={action.id}
            danger={action.danger}
            onClick={action.onClick}
            className="gap-2"
          >
            <span className={action.danger ? "text-[var(--error)]" : "text-[var(--text-muted)]"}>
              {action.icon}
            </span>
            <span className="flex-1">{action.label}</span>
            {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        );
      })}
    </AnchoredDropdown>
  );
}

export default QuickActionsDropdown;
