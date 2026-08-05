---
lat:
  require-code-mention: true
---

# Prompt Navigator tests

Test specifications for Conversation Prompt Navigator utilities, UI, active-turn tracking, and open-preference persistence.

## Prompt Navigator tests

Leaf cases below must each have exactly one `@lat:` mention in test code.

### Utils extract only user prompts

Verify prompt extraction keeps user prompts and ignores assistant/tool noise so navigator entries match what users typed.

### Navigator UI open and select

Verify opening the navigator and selecting an entry jumps/focuses the corresponding transcript turn.

### Active turn and jump

Verify active-turn tracking updates on scroll/selection and jump helpers move to the intended prompt index.

### Open preference persistence

Verify the user’s navigator open/closed preference persists across layout remounts as specified by the chat layout tests.
