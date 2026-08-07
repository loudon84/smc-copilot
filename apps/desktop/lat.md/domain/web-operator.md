# Web Operator

Web Operator is the desktop browser automation workspace: a profile-aware WebContentsView with toolbar, page structure, Hermes task handoff, and Host/CRM bridges.

Related: [[decisions#Web Operator actions are auditable and profile-aware]], [[domain/chat#Session and model scoping]].

## Web Operator

Browser control belongs in Main (`BrowserController` / ShellBrowserViewAdapter → ShellView layer `web-operator`). Renderer drives actions only through `window.aiosBrowser`.

Partitions keep login state separate (`persist:web-operator` vs portal vs per-tab external). Sensitive actions (type, submit, pay, delete, upload, credential changes) require confirmation and audit records.

## Hermes task handoff

Page context can start or resume a Local Hermes task bound by source + requestId (task session SQLite). Chat uses `hermesDefaultChat` with `draft_weboperator` and must not pass Workspaces `workspaceChat` or force session model IPC.

## Host and CRM bridges

HostBridge / CRM Bridge are allowlisted bidirectional channels with size limits and command ack — never raw Node access.

Gesture checks apply where required. Desktop may push form-fill commands; pages emit structured context events only.
