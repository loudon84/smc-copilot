# File Domain

Core ManagedFile domain concepts for the File Platform: identity, associations, status, and profile isolation.

## ManagedFile

A [[src/shared/files/managed-file.ts#ManagedFile]] is metadata about a user or agent file — name, mime, category, hash, optional paths — separate from on-disk bytes.

Local content-hash dedup lets many associations share one physical object. Remote Expert artifacts use `(provider, remoteArtifactId)` identity and are never collapsed by hash alone. They set `locality: "remote"` with availability and Main-normalized `canPreview`. Message reports become ManagedFiles with `source: "agent-output"` via [[src/shared/files/message-document.ts#CreateFileFromMessageInput]] without changing the Assistant Message itself.

## FileAssociation

[[src/shared/files/file-association.ts#FileAssociation]] links a ManagedFile to a session, message, or task with a role (`prompt-attachment`, `message-attachment`, `context-file`, …). Deleting an association does not delete the physical object.

## Transport modes

`local` may send `path-ref` absolute paths to Hermes Agent. `remote` must inline images/small text or parsed text only — never leak host absolute paths (see [[file-platform#Attachment adapter]]).
