---
lat:
  require-code-mention: true
---

# Persistent Chat Workspace tests

Test specifications for v8.2 Main-owned chat-workspace.db, draft→session bind, openSession dedupe, v1 migration, and session-catalog drafts listing.

## Persistent Chat Workspace tests

Leaf cases below must each have exactly one `@lat:` mention in the matching Vitest file.

### Opens runs and restores snapshot order

Verify consecutive [[src/main/chat-workspace/chat-workspace-service.ts#openRun]] calls preserve position order and the last activated run becomes `activeRunId` on [[src/main/chat-workspace/chat-workspace-service.ts#getSnapshot]].

### Binds session turning draft into session

Verify [[src/main/chat-workspace/chat-workspace-service.ts#bindSessionToRun]] sets `sessionId` and updates title when `titleSource` is not `user`, transforming a draft into a session run.

### Open session deduplicates by session id

Verify [[src/main/chat-workspace/chat-workspace-service.ts#openSession]] reuses an existing linked run (`created: false`) instead of opening a duplicate tab for the same profile/session pair.

### Migrates v1 localStorage shape once

Verify [[src/main/chat-workspace/chat-workspace-service.ts#migrateFromV1]] imports legacy workspace runs once and ignores a second migrate call after the migration marker is set.

### Session catalog lists drafts from workspace

Verify [[src/main/session-catalog/session-catalog-service.ts#listSessions]] with `includeDrafts: true` surfaces open draft runs from the workspace store (null `sessionId`).
