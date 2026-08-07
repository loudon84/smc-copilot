/** Port for opening URLs outside Chat (maps to WebOperator in AI-OS). */
export interface ChatNavigationPort {
  openWeb(url: string): Promise<void> | void;
  openExternal?(url: string): Promise<void> | void;
}
