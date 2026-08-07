import type {
  HostBridgeResult,
  HostBridgeStoredEvent,
  HostBridgeStoredReadyEvent,
  HostDesktopCommand,
} from "../../../../../shared/crm-bridge";

export type HostBridgeCommandContextValue = {
  lastEvent: HostBridgeStoredEvent | null;
  lastReadyEvent: HostBridgeStoredReadyEvent | null;
  hostBridgeReady: boolean;
  runCommand: (command: HostDesktopCommand) => Promise<HostBridgeResult | null>;
  sending: boolean;
  lastCommandResult: HostBridgeResult | null;
};
