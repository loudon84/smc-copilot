# Desktop Kanban Module

Renderer Kanban UI lives under `modules/kanban` and talks to Runtime only through `KanbanRuntimePort`.

## Module layout

`KanbanPage` mounts `useKanbanController` and renders `KanbanModule`. Board selection is presentation state (`localStorage`); requests always pass `boardSlug` explicitly.

## IPC bridge

`window.kanbanRuntime` (preload) → `kanban-ipc` (Main) → `kanban-client` → `@smc/runtime-client` `kanban` domain. CI guard `check:no-desktop-kanban-hermes-access` forbids Hermes CLI/DB access inside the module.

## Refresh

P0 uses 6s polling plus focus/visibility refresh. Runtime unavailable surfaces as an error banner with no Hermes fallback.
