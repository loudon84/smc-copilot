---
name: smc-work-router
description: Canonical GES Work Router with explicit risk facts and monotonic NONE/LEAN/FULL governance.
version: 5.0.3
---
# GES Work Router

Canonical owner of Work Facts routing. Read references/work-routing-contract.md and references/work-facts-authority-contract.md. Route one request with scripts/work_router.py using a verified `smc.ges.work-facts.v1` envelope; unknown or stale risk selects FULL.

## Claim vocabulary

Use only: `INSPIRED`, `ADAPTER_READY`, `UPSTREAM_PINNED`, `EXTERNAL_VERIFIED`. Do not say "integrated" for any of those states.

## Canonical ownership

Architecture and Roadmap keep their existing owners. smc-prd-grounding owns discover/clarify/verify/revision; smc-prd-review and smc-prd-converge review and approve the same PRD. Only smc-plan-from-approved-prd-ponytail creates the canonical Plan (`smc.plan.v3.7`). smc-plan-delivery owns all post-creation sequencing through audit, review, verification, freshness, post_review commit and separate Roadmap DONE.

Official Superpowers skills are a separate method-provider namespace under `integrations/superpowers/` — not this Work Router.

## Continuation

Read the existing artifact's governance_profile before routing and supply it as --previous-profile. FULL cannot become LEAN; LEAN cannot become NONE. Existing v3.6 Plans remain in-flight compatibility only; new Plans use v3.7.
