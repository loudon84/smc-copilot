export type HermesRuntimeSection =
  | "overview"
  | "install"
  | "gateway"
  | "profiles"
  | "models"
  | "providers"
  | "skills"
  | "tools"
  | "soul"
  | "memory"
  | "schedules"
  | "connection"
  | "backup"
  | "logs"
  | "network"
  | "doctor";

export const HERMES_RUNTIME_IMPLEMENTED_SECTIONS = [
  "overview",
  "install",
  "gateway",
  "connection",
  "doctor",
  "logs",
] as const satisfies readonly HermesRuntimeSection[];

export type HermesRuntimeImplementedSection =
  (typeof HERMES_RUNTIME_IMPLEMENTED_SECTIONS)[number];
