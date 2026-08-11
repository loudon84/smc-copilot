---
lat:
  require-code-mention: true
---

# Prompt Navigator tests

Unit and component coverage for extraction, UI, jump/active-line behavior, and open-preference persistence.

## Utils extract only user prompts

Verifies user-only filtering, attachment-only prompts, markdown label cleanup, truncation, continuous sequence numbers, and run-scoped anchor ids.

## Navigator UI open and select

Verifies hide when fewer than two prompts, closed trigger count, open list with `aria-current`, select callback, and hide control.

## Active turn and jump

Verifies active-line selection during a long reply, jump highlighting via `scrollToNode`, and that inactive Chat instances do not register scroll listeners.

## Open preference persistence

Verifies `hermes:chat:prompt-navigator-open` defaults to open and persists independently of Session Files visibility.
