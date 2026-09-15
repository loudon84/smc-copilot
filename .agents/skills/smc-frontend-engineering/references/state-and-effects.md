# State and Effects Policy

Priority: derive > event-driven update > external synchronization effect.

## MUST

- Do not mirror props/derived values into local state without a real independent lifecycle.
- Effects that subscribe/start resources must clean them up deterministically.
- Async effects must prevent stale completion from overwriting newer intent when races are possible.
- Do not create two writers for the same user-visible state.

## REVIEW TRIGGERS

- effect calls setState to keep two values in sync;
- multiple providers own overlapping state;
- repeated run-id / request-id race guards;
- global state introduced for a single local surface.
