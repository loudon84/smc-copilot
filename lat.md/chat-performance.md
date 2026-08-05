# Chat Performance

Chat composer performance constraints that avoid layout thrash during typing and streaming.

Related UI entry: chat input in `modules/chat` (see [[chat-commands#Slash command execution]] for command paths).

## Textarea auto-resize avoids per-keystroke reflow

Composer height adjusts without forcing expensive document reflow on every keystroke. Prefer batched measurement / rAF (or equivalent) over synchronous layout reads in the input handler.
