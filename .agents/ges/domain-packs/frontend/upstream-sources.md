# Frontend Policy Sources

The reference pack was designed from the React/Design skill categories reviewed during the GES v4.3 design work. External content is treated as source material, not a runtime authority.

Adopted themes:

- React performance: waterfalls, bundle cost, rerender/rendering discipline.
- React composition: explicit variants, composition, state ownership, context boundaries.
- Tailwind/design system: semantic tokens, component consistency, accessibility.
- Frontend design: visual intent, typography, motion and spatial composition as advisory guidance.

Rules that depend on a framework not declared by the Consumer (for example Next.js server/RSC behavior) are excluded from the Frontend v1 baseline.

Production blocking policy is pinned in `policy-lock.json`. Updating upstream guidance requires an explicit Domain Pack version/policy update and cannot silently change an in-flight Plan.
