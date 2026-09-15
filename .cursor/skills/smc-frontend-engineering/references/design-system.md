# Design System Policy

Order of preference:

```text
existing semantic token
> new semantic token justified by the design model
> raw/arbitrary value
```

and:

```text
existing primitive / variant
> extension of established primitive
> new duplicate component
```

## MUST

- Respect Consumer theme/token ownership.
- Prefer semantic color/spacing/typography/radius variables over one-off literals.
- Preserve light/dark/native appearance contracts where the Consumer declares them.
- Do not impose shadcn, CVA, MUI, Ant Design, Radix, or any other UI library from GES Core.
