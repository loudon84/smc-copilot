# Hermes Desktop

Hermes Desktop (SMC-Copilot) is an Electron shell for operating a local or remote `hermes-agent`. It owns UI, IPC, install, and runtime control — not LLM inference.

This directory is the project’s high-level concept graph. Source anchors concepts with `@lat: [[section]]` comments; agents should read here before guessing architecture.

## What the product owns

Desktop owns window lifecycle, Renderer UI, Preload bridges, IPC routing, local config UX, filesystem orchestration, Gateway process control, profile runtime control plane, Web Operator, and Windows install/bootstrap.

## What the product does not own

Python `hermes-agent` owns LLM routing, tool execution, memory retrieval, skill execution, Gateway HTTP/SSE (`/v1/chat/completions`), and agent-side orchestration. Treat the Gateway as an external black box.

## Directory

Top-level concept files in this folder. Start with architecture and decisions, then open a domain or chat subsystem file as needed.

- [[architecture]] — Three-layer process model, Preload contract, Main ownership, primary code anchors
- [[decisions]] — Cross-cutting design decisions and invariants
- [[domain]] — Product domains (profiles, gateway, chat, auth, install, MCP, Web Operator)
- [[file-platform]] — Chat managed-file platform (parse, preview, jobs, security)
- [[session-file-context]] — Session file context builder, FTS chunking, Session Files panel + live badge
- [[chat-commands]] — Slash command routing (local vs gateway); runtime Clarify/Approval is under [[domain/chat]]
- [[file-ui-components]] — Chat file preview and document action UI
- [[chat-performance]] — Composer performance constraints
- [[prompt-navigator]] — Conversation prompt navigator concept
- [[prompt-navigator-tests]] — Prompt navigator test specifications
- [[durable-chat-runtime-tests]] — v8.1 Durable Chat Runtime test specifications
- [[persistent-chat-workspace-tests]] — v8.2 Persistent Chat Workspace + Session Catalog test specifications
- [[serve-runtime-tests]] — v9.0 Serve-First Runtime Phase 0/1/2 test specifications
- [[kanban]] — v1.7 Hermes Kanban module (Renderer Port → Runtime facade)
- [[remote-dashboard-oauth]] — Remote dashboard OAuth transport guarantees
