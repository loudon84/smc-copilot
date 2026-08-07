# Domain

Product domain concepts for Hermes Desktop control-plane features. Read the matching file before changing that area.

Architecture framing: [[architecture#Three-layer process model]]. Decisions: [[decisions#Key design decisions]].

## Directory

Sibling domain concept files under `lat.md/domain/`. Pick the domain that matches the code you are changing.

- [[auth]] — Startup gate, token vault, Portal bootstrap
- [[chat]] — Chat runtime/turn isolation, hydrate vs bind, floating rail, v8.2 Main workspace persist + session catalog, surfaces
- [[gateway]] — Gateway lifecycle and multi-profile runtime
- [[install]] — Windows runtime layout and bootstrap vs NSIS
- [[mcp]] — MCP Skill Gateway, Hermes MCP host mode, GeneHub/Experts
- [[profiles]] — Profile isolation, home layout, delegation
- [[serve-runtime]] — v9.0 Serve-First connection, pairing, Device Token, production process policy, Phase 2 Gateway/YAML control plane, Phase 2 control plane
- [[web-operator]] — Browser automation, Hermes task handoff, Host/CRM bridges
