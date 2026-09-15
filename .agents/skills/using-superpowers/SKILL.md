---
name: using-superpowers
description: Deprecated compatibility shim — delegates to canonical smc-work-router. Do not add business logic here.
version: 5.0.3
deprecated: true
canonical: smc-work-router
---
# Deprecated: using-superpowers

This skill is a one-release compatibility shim. Canonical Work Router is **smc-work-router**.

All Work Facts, routing contracts, and production CLI live under `.agents/skills/smc-work-router/`. This directory only re-exports and prints a deprecation warning.

Official Superpowers method providers are unrelated and live under `engineeing-skills/integrations/superpowers/`.
