/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAT_ENGINE?: "legacy" | "copilot" | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
