# File config and transport

`desktop.files.*` is read only in Main; the Renderer receives trimmed [[src/shared/files/file-contracts.ts#FilesCapabilities|FilesCapabilities]].

Detailed types live in [[src/shared/files/file-contracts.ts]] and [[src/main/files/file-config.ts]].

Local mode may pass path-ref attachments to Hermes. Remote mode must not send local absolute paths — images and small text stay inline, and larger documents rely on parsed text or `FILE_REMOTE_UNSUPPORTED`.
