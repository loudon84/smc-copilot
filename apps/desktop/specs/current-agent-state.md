# Current Agent State

- current_stage: done
- p1-model-catalog: done
- p2-default-model: done
- p3-reconcile: done
- p4-desktop-boot: done
- p5-state-split: done
- p6-chat-gate: done
- p7-model-picker: done
- guards-tests: done
- docs-sync: done
- last_updated: 2026-08-10
- notes: >
  PRD v1.5.4 Hotfix complete. Runtime catalog uses /api/model/options + config.yaml;
  Desktop boot connects only; chatReady gates ServeChatRuntimeAdapter;
  Model Picker uses window.copilotRuntime.listChatModels. Manual E2E
  (dev:runtime + dev:desktop SSE) remains for the user.
  Note: full `npm run guard` in apps/desktop still fails pre-existing
  check:no-renderer-runtime-http on RuntimePairingScreen (127.0.0.1:8765 display).
