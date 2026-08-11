# Conversation Prompt Navigator

Floating outline of the current session's user prompts inside the chat messages panel for round positioning.

The navigator lives inside [[src/renderer/src/screens/Chat/Chat.tsx]]'s `.chat-messages` shell as a sibling of `.chat-messages-scroll`. It is **not** a fourth `chat-body` column beside Session Files or File Preview. Visibility of Session Files and of the Prompt Navigator are independent (`hermes:chat:session-files-visible` vs `hermes:chat:prompt-navigator-open`).

## Scope and data

Only user chat bubbles become navigation items: `role === "user"` with no history `kind` (or `kind === "user"`), and non-empty normalized text or at least one attachment.

Assistant bubbles, reasoning, tool rows, clarify cards, typing indicators, and slash loaders are excluded. Items are built from the in-memory `messages` array via [[src/renderer/src/screens/Chat/prompt-navigator/promptNavigatorUtils.ts#buildPromptNavigationItems]] — no Main Process, Preload, or SQLite involvement.

## Run-scoped DOM anchors

Multiple Chat instances stay mounted (background runs keep streaming); only `active` controls visibility and interaction.

User message rows therefore get a DOM id from [[src/renderer/src/screens/Chat/prompt-navigator/promptNavigatorUtils.ts#getPromptAnchorId]] that includes both `runId` and `messageId`, so `document.getElementById` cannot collide across background Chats. [[src/renderer/src/screens/Chat/MessageList.tsx]] passes `runId` into [[src/renderer/src/screens/Chat/MessageRow.tsx]] for user bubbles only.

## Active-turn tracking

While reading a long assistant reply, the matching user prompt may be off-screen; the navigator still highlights that turn.

Current prompt = the last user-prompt anchor whose top is at or above `scrollContainerTop + 96px` ([[src/renderer/src/screens/Chat/prompt-navigator/usePromptNavigator.ts#findActivePrompt]]). Only the active Chat registers scroll listeners and ResizeObservers; updates are `requestAnimationFrame`-throttled and skip `setState` when the id is unchanged.

Jumping calls [[src/renderer/src/screens/Chat/hooks/useChatScroll.ts#useChatScroll]]'s `scrollToNode`, which sets `userScrolledUpRef` so streaming chunks do not yank the view back to the bottom. Sending a new user message still force-scrolls to the bottom as before.

## Width and maximize

When `.chat-messages` width is below 900px, the navigator enters compact styling without forcing the open preference closed.

File Preview maximize already hides `.chat-messages` (visibility + pointer-events), so the navigator disappears with the transcript and needs no separate maximize handling.
