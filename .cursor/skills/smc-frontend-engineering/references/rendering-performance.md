# Rendering and Performance Policy

## MUST

- Avoid avoidable sequential async waterfalls when operations are independent.
- Do not import heavy optional functionality into initial render paths without evidence it is needed there.
- Clean up timers, observers, media/audio contexts, subscriptions, workers, and event listeners.

## Memoization

No evidence -> do not memoize by default.

Use `useMemo` / `useCallback` / memoized component boundaries only for expensive computation, referential identity consumed by a sensitive child/dependency, or measured/high-confidence rerender cost.

Next.js/RSC/server-only rules are outside this pack unless a Consumer profile explicitly adds them through another Domain Pack.
