# React Composition Policy

## MUST

- Keep stateful orchestration at the narrowest owner that coordinates the behavior.
- Prefer explicit variants/compound composition over expanding matrices of unrelated boolean props.
- Reuse established primitives before creating near-duplicate controls, dialogs, panels, cards, or selectors.
- Split a component when unrelated state domains, lifecycle ownership, or cross-feature orchestration make local reasoning unsafe; line count alone is not a gate.

## SHOULD

- Separate feature/container orchestration from reusable view primitives when that reduces coupling.
- Use context for a coherent shared domain with a clear provider boundary, not as a default replacement for props/local state.
- Keep public component APIs minimal and observable-behavior oriented.
