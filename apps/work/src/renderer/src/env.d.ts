/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_BASE_URL?: string;
  readonly VITE_ANALYTICS_API_KEY?: string;
  readonly VITE_HERMES_DESKTOP_APP_NAME?: string;
  readonly VITE_HERMES_DESKTOP_DASHBOARD_CHAT?: string;
  readonly VITE_HERMES_DESKTOP_DASHBOARD_EVENT_LOG?: string;
  readonly VITE_SKIP_PORTAL_LOGIN?: string;
  readonly HERMES_SKIP_PORTAL_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
