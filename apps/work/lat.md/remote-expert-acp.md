# Remote ACP Expert

Original Chat can select a NodeSkClaw Remote Expert. Electron Main owns ACP stdio, credentials, and files; Renderer only sees semantic events.

## Contract lock

Pinned Provider contract lives under `contracts/nodeskclaw/remote-expert-frontend-v1.0.0/contract-lock.json`. Compatibility is digest-based, not tag-name-based.

## Bounded context

Main code lives in [[src/main/remote-expert-acp/register-ipc.ts]]. It must not import legacy Expert or Skill Run execution modules. Chat entry is [[src/renderer/src/screens/Chat/remote-expert/RemoteExpertContextControl.tsx]] via ChatInput toolbarExtras.

## Session identity

SMC `sessionId` is local history identity. ACP `acp_session_id` is remote continuity, stored in `desktop_remote_expert_bindings`. Resume uses `session/resume` and never silent `session/new`.
