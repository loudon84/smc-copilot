# File UI components

Renderer components for chat file preview, message document actions, and agent output cards. They consume Preload file APIs only.

Backing platform: [[file-platform#File Platform]]. Session panel: [[session-file-context#Session Files Panel]].

## Message document preview

Inline/message document preview opens a safe preview for an attached managed file using hooks that subscribe to preview/job state.

## Message document actions

Action affordances on message documents (open preview, reveal/save where allowed) without exposing absolute paths in UI state.

## Agent output card

Card UI for a single agent output file — title, status, and open/preview entry points shared by message and session-file layouts.
