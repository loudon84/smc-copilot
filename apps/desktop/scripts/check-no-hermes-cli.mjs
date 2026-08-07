#!/usr/bin/env node
/**
 * Scaffold: ban Desktop Hermes CLI invocations outside legacy (Phase 8).
 *
 * Phase 2 note: Gateway CLI / YAML control-plane writes are already fail-closed
 * unless COPILOT_ALLOW_LEGACY_HERMES_DIRECT=true (see runtime-adapters/gateway-control.ts
 * and config-control.ts). This script remains non-blocking until Phase 8 hard delete.
 */
console.log(
  "[check:no-hermes-cli] scaffold ok (Phase 2 control-plane guards live; hard ban at Phase 8)",
);
process.exit(0);
