import {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DialogDescriptor,
  DialogOpenInput,
  DrawerDescriptor,
  DrawerOpenInput,
  OverlayContextValue,
} from "./overlay-types";
import {
  computeHasBlockingDialog,
  computeHasBlockingDrawer,
  computeNativeBlocked,
  createDialogId,
  createDrawerId,
} from "./overlay-types";

export const OverlayContext = createContext<OverlayContextValue | null>(null);

export interface OverlayProviderProps {
  children: ReactNode;
  legacyDrawerBlocking?: boolean;
}

export function OverlayProvider({
  children,
  legacyDrawerBlocking = false,
}: OverlayProviderProps): React.JSX.Element {
  const [dialogs, setDialogs] = useState<DialogDescriptor[]>([]);
  const [drawers, setDrawers] = useState<DrawerDescriptor[]>([]);

  const hasBlockingDialog = useMemo(
    () => computeHasBlockingDialog(dialogs),
    [dialogs],
  );
  const hasBlockingDrawer = useMemo(
    () => computeHasBlockingDrawer(drawers),
    [drawers],
  );
  const nativeBlocked = useMemo(
    () => computeNativeBlocked(legacyDrawerBlocking, dialogs, drawers),
    [legacyDrawerBlocking, dialogs, drawers],
  );

  const closeDialogById = useCallback(
    (id: string, onEntry: (entry: DialogDescriptor) => void): void => {
      let matched: DialogDescriptor | undefined;
      setDialogs((prev) => {
        matched = prev.find((dialog) => dialog.id === id);
        if (!matched) return prev;
        return prev.filter((dialog) => dialog.id !== id);
      });
      if (matched) onEntry(matched);
    },
    [],
  );

  const dialogApi = useMemo(
    () => ({
      open<TPayload = unknown, TResult = unknown>(
        input: DialogOpenInput<TPayload, TResult>,
      ): Promise<TResult> {
        return new Promise<TResult>((resolve, reject) => {
          const id = createDialogId();
          const descriptor: DialogDescriptor<TPayload, TResult> = {
            ...input,
            id,
            createdAt: Date.now(),
            nativeBlocking: input.nativeBlocking ?? true,
            closeOnEsc: input.closeOnEsc ?? true,
            closeOnBackdrop: input.closeOnBackdrop ?? false,
            resolve,
            reject,
          };
          setDialogs((prev) => [...prev, descriptor as DialogDescriptor]);
        });
      },

      close(id: string, result?: unknown): void {
        closeDialogById(id, (entry) => {
          entry.resolve?.(result);
        });
      },

      dismiss(id: string, reason?: unknown): void {
        closeDialogById(id, (entry) => {
          entry.reject?.(reason);
        });
      },

      closeAll(): void {
        let pending: DialogDescriptor[] = [];
        setDialogs((prev) => {
          pending = prev;
          return [];
        });
        for (const entry of pending) {
          entry.reject?.(new Error("Dialog closed"));
        }
      },
    }),
    [closeDialogById],
  );

  const drawerApi = useMemo(
    () => ({
      open<TPayload = unknown>(input: DrawerOpenInput<TPayload>): string {
        const id = createDrawerId();
        const descriptor: DrawerDescriptor<TPayload> = {
          ...input,
          id,
          createdAt: Date.now(),
          nativeBlocking: input.nativeBlocking ?? true,
        };
        setDrawers((prev) => [...prev, descriptor as DrawerDescriptor]);
        return id;
      },

      close(id: string): void {
        setDrawers((prev) => prev.filter((drawer) => drawer.id !== id));
      },

      closeAll(): void {
        setDrawers([]);
      },
    }),
    [],
  );

  const value = useMemo<OverlayContextValue>(
    () => ({
      dialogs,
      drawers,
      legacyDrawerBlocking,
      hasBlockingDialog,
      hasBlockingDrawer,
      nativeBlocked,
      dialogApi,
      drawerApi,
    }),
    [
      dialogs,
      drawers,
      legacyDrawerBlocking,
      hasBlockingDialog,
      hasBlockingDrawer,
      nativeBlocked,
      dialogApi,
      drawerApi,
    ],
  );

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}
