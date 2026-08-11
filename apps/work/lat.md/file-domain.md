# File Domain

Core ManagedFile domain concepts for the File Platform: identity, associations, status, and profile isolation.

## ManagedFile

A [[src/shared/files/managed-file.ts#ManagedFile]] is metadata about a user or agent file — name, mime, category, hash, optional original/managed paths — separate from the bytes on disk. Content-hash dedup means many associations can share one physical object.

Message reports become ManagedFiles with `source: "agent-output"` via [[src/shared/files/message-document.ts#CreateFileFromMessageInput]] without changing the Assistant Message itself.

## FileAssociation

[[src/shared/files/file-association.ts#FileAssociation]] links a ManagedFile to a session, message, or task with a role (`prompt-attachment`, `message-attachment`, `context-file`, …). Deleting an association does not delete the physical object.

## Transport modes

`local` may send `path-ref` absolute paths to Hermes Agent. `remote` must inline images/small text or parsed text only — never leak host absolute paths (see [[file-platform#Attachment adapter]]).
