# Frontend Audit Report

- Project: `E:\git\smc-copilot`
- Audited at: `2026-09-15T10:39:38Z`
- Adoption mode: `ENFORCED`
- Overall: `PASS`
- Applied: `True`

## Layers

- **static_scan**: `PASS`
- **semantic_roles**: `PASS`
- **calibration**: `OBSERVE`
  - [ ] Confirm Sidebar / Header / Workspace / Settings / Account / Navigation regions
  - [ ] Confirm identity_control surfaces match product UX (avatar/profile/logout)
  - [ ] Confirm shared UI packages are correctly classified (no business surfaces)
- **frontend_context**: `PASS`

## Apps

- `knowledge` root=`apps/knowledge` adapter=`react-electron`
- `work` root=`apps/work` adapter=`react-electron`
- `runtime-client-ts` root=`packages/runtime-client-ts` adapter=`generic`
