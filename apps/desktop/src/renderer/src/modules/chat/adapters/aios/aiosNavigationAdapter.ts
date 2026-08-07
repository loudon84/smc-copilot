import type { ChatNavigationPort } from "../../ports/ChatNavigationPort";

/**
 * AI-OS adapter: open URLs via WebOperator (aiosBrowser), not Chat WebView.
 */
export const aiosNavigationAdapter: ChatNavigationPort = {
  async openWeb(url: string): Promise<void> {
    if (!url?.trim()) return;
    await window.aiosBrowser.open({
      url: url.trim(),
      source: "user",
      activateTab: true,
    });
  },
  async openExternal(url: string): Promise<void> {
    if (!url?.trim()) return;
    await window.hermesAPI.openExternal(url);
  },
};
