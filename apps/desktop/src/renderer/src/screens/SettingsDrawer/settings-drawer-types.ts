export type SettingsDrawerPanel =  
  | "account"  
  | "runtime"
  | "server"
  | "profiles"
  | "general"  
  | "desktop";

export const SETTINGS_DRAWER_PANELS: SettingsDrawerPanel[] = [  
  "account",
  "runtime",
  "server",
  "profiles",
  "general",  
  "desktop",
];

const VALID_PANELS = new Set<string>(SETTINGS_DRAWER_PANELS);

export function isSettingsDrawerPanel(value: string | undefined): value is SettingsDrawerPanel {
  return value !== undefined && VALID_PANELS.has(value);
}
