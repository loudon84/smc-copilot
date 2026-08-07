# Current Agent State

- current_stage: done
- phase0-*: done
- p1-*: done
- p2-*: done
- h1-h5: done
- p3-contracts-gate: done
- p3-clients-sse: done
- p3-adapter: done
- p3-ipc-wire: done
- p3-tests-docs: done
- last_updated: 2026-08-07
- notes: >
  Phase 3 Chat Runtime cutover complete. Vitest phase1+2+3 30/30;
  typecheck OK; check:no-legacy-profile-chat OK (workspace-chat allowlisted);
  lat check passed. window.chatRuntime → ServeChatRuntimeAdapter → chat-runs*
  when Serve preferred + Ready; fail-closed otherwise.
