export type DialogType =
  | "confirm"
  | "danger-confirm"
  | "web-operator-task-start"
  | "browser-sensitive-action"
  | "crm-command-confirm"
  | "custom";

export type DrawerType =
  | "settings"
  | "config-diff-confirm"
  | "runtime-setting"
  | "profile-detail"
  | "custom";

export interface ConfirmDialogPayload {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface CustomDialogPayload {
  renderKey?: string;
}

export interface CustomDrawerPayload {
  renderKey?: string;
}

export interface DialogDescriptor<TPayload = unknown, TResult = unknown> {
  id: string;
  type: DialogType;
  title?: string;
  payload?: TPayload;
  nativeBlocking?: boolean;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
  createdAt: number;
  resolve?: (result: TResult) => void;
  reject?: (reason?: unknown) => void;
}

export interface DrawerDescriptor<TPayload = unknown> {
  id: string;
  type: DrawerType;
  title?: string;
  payload?: TPayload;
  nativeBlocking?: boolean;
  createdAt: number;
}

export interface OverlayState {
  dialogs: DialogDescriptor[];
  drawers: DrawerDescriptor[];
  legacyDrawerBlocking: boolean;
  hasBlockingDialog: boolean;
  hasBlockingDrawer: boolean;
  nativeBlocked: boolean;
}

export interface DialogOpenInput<TPayload = unknown, TResult = unknown> {
  type: DialogType;
  title?: string;
  payload?: TPayload;
  nativeBlocking?: boolean;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
}

export interface DrawerOpenInput<TPayload = unknown> {
  type: DrawerType;
  title?: string;
  payload?: TPayload;
  nativeBlocking?: boolean;
}

export interface DialogApi {
  open<TPayload = unknown, TResult = unknown>(
    input: DialogOpenInput<TPayload, TResult>,
  ): Promise<TResult>;

  close(id: string, result?: unknown): void;

  dismiss(id: string, reason?: unknown): void;

  closeAll(): void;
}

export interface DrawerApi {
  open<TPayload = unknown>(input: DrawerOpenInput<TPayload>): string;

  close(id: string): void;

  closeAll(): void;
}

export interface OverlayContextValue extends OverlayState {
  dialogApi: DialogApi;
  drawerApi: DrawerApi;
}

export function computeNativeBlocked(
  legacyDrawerBlocking: boolean,
  dialogs: DialogDescriptor[],
  drawers: DrawerDescriptor[],
): boolean {
  if (legacyDrawerBlocking) return true;
  if (dialogs.some((dialog) => dialog.nativeBlocking !== false)) return true;
  if (drawers.some((drawer) => drawer.nativeBlocking !== false)) return true;
  return false;
}

export function computeHasBlockingDialog(dialogs: DialogDescriptor[]): boolean {
  return dialogs.some((dialog) => dialog.nativeBlocking !== false);
}

export function computeHasBlockingDrawer(drawers: DrawerDescriptor[]): boolean {
  return drawers.some((drawer) => drawer.nativeBlocking !== false);
}

export function createDialogId(): string {
  return crypto.randomUUID();
}

export function createDrawerId(): string {
  return crypto.randomUUID();
}
