# Prompt Navigator

Conversation Prompt Navigator lets users jump between user prompts in a long chat transcript without scrolling manually.

Tests: [[prompt-navigator-tests#Prompt Navigator tests]].

## Conversation Prompt Navigator

Utilities extract user-prompt turns from the message list and drive a navigator UI that jumps the transcript to the selected turn.

In Copilot Chat (v8.0.4+), the trigger and panel mount on [[domain/chat#Floating rail]] via [[src/renderer/src/modules/chat/components/floating/ChatFloatingRail.tsx#ChatFloatingRail]] — not inside the message scroll or Composer. Fewer than two prompts hides the trigger; narrow viewports keep the icon.
### Active-turn tracking

Tracks which user prompt is active relative to viewport/selection so the navigator highlight stays aligned while the user scrolls or streams new content.
