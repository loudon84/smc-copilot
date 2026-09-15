---
name: smc-frontend-preplan
description: GES Frontend Domain v2 pre-plan provider for React/Vue. Freezes UI architecture decisions that materially affect Plan slicing without designing CSS implementation details.
version: 2.0.0
---
# Frontend Pre-Plan v2

Run for activated frontend Changes before canonical Plan creation. Write/validate `## Frontend Design Intent`
in the existing Stage PRD; never create a second design/plan artifact.

For each frontend Change decide: Surface, Framework (React/Vue/generic), Layout pattern/regions,
Component Map with REUSE/EXTEND/NEW/REMOVE, State Ownership, Interaction states, Design System strategy,
Responsive behavior and Visual Verification level. Existing components/primitives/tokens are preferred.

NONE/LIGHT/FULL UX depth is allowed internally: token/text-only may be N/A; new page/layout/state-owner/navigation/
responsive architecture requires FULL frontend intent. If preplan discovers a new application owner/API/store/security
boundary, return upstream FULL_REQUIRED rather than deciding architecture locally.
