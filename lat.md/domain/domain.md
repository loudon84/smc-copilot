# Domain

Product domain concepts for Hermes Desktop control-plane features. Read the matching file before changing that area.

Architecture framing: [[architecture#Three-layer process model]]. Decisions: [[decisions#Key design decisions]].

## Directory

Sibling domain concept files under `lat.md/domain/`. Pick the domain that matches the code you are changing.

- [[auth]] — Startup gate, token vault, Portal bootstrap
- [[chat]] — Chat runtime isolation, per-run workspace state, surfaces, session model scoping
- [[gateway]] — Gateway lifecycle and multi-profile runtime
- [[install]] — Windows runtime layout and bootstrap vs NSIS
- [[mcp]] — MCP Skill Gateway, Hermes MCP host mode, GeneHub/Experts
- [[profiles]] — Profile isolation, home layout, delegation
- [[web-operator]] — Browser automation, Hermes task handoff, Host/CRM bridges
