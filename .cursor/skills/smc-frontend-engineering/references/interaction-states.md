# Interaction State Closure

For every changed user action, explicitly classify applicable states:

```text
idle / hover / focus / active / disabled / loading / empty / error / success / cancelled / retry
```

A state may be `NOT_APPLICABLE`, but silent omission is not closure when the product behavior can enter that state.

Network/runtime-backed actions must define failure feedback and duplicate-submit behavior.
