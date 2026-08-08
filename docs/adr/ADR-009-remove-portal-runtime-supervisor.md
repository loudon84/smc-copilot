# ADR-009: Remove Portal Runtime supervisor from Desktop

## Status

Accepted (PRD v1.4 Phase G/H)

## Context

`PortalRuntimeSection` and `aios-runtime-supervisor` let Desktop start/stop Portal
frontend/backend PIDs. That conflicted with Serve-First / Runtime-as-SOT and
confused Offline recovery UX.

## Decision

- Delete Portal Runtime supervisor UI and live `startAiOs` control from Desktop.
- Endpoint/config display may remain; process management must not.
- Guard `check-no-desktop-portal-runtime` fails if `PortalRuntimeSection.tsx` exists
  or `aios-ipc` still invokes `startAiOs` as a real implementation.

## Consequences

- Portal Auth Backend (login) remains a separate concern from Agent Runtime.
- Users recover Runtime via pairing / external Runtime service, not Desktop Start Portal.
