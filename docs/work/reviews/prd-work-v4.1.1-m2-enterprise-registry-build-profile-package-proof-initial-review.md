# WORK v4.1.1 M2 Enterprise Registry Build Profile & Package Proof — Initial PRD Review

Review scope is RM-02 Stage PRD v1.0.0 (`REVIEW_REQUIRED`) grounded at `96e73e7bfa76f2ec02dba3466bd4430ff6d2ca6c`. It reuses the approved AD, Roadmap item, and the PRD's focused source anchors; it does not re-scan unrelated Work domains.

## Verdict

REVISE

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | REVISE | RM-02 correctly excludes runtime/Renderer changes, but it does not yet define whether every supported Electron package entry point must apply the selected profile. |
| G2 Existing Capability | PASS | The proposal extends the existing generator, electron-builder resource configuration, and release validation rather than adding a Registry runtime owner. |
| G3 Production Ownership | PASS | Existing Work build/release pipeline owns profile ingress and final package proof; RM-01 Main Registry remains the sole runtime consumer. |
| G4 Classification | PASS | Build ingress, resource selection, package validation, regression coverage, and LAT are MODIFY; all runtime/configuration owners remain KEEP. |
| G5 Contract/Security Boundary | PASS | The complete file contract is atomic, Main-build-only, rejects partial overrides and credentials, and keeps descriptors out of Renderer/IPC. |
| G6 Behaviour to AC | REVISE | AC-01 through AC-05 do not require every supported package command to prepare the profile, leaving macOS/Linux package behavior unspecified. |
| G7 Evidence Integrity | PASS | New profile/package claims are NEW_EVIDENCE; RM-01 and existing package proof are correctly marked affected rather than silently reused. |

## Blocking Findings

None.

## Major Findings

| ID | Finding | Required closure |
|---|---|---|
| M1 | Current package entry points are not uniform: Windows/unpacked builds invoke the build generator, while macOS/Linux entry points can bypass it. The PRD says “enterprise Work package” and the Roadmap requires Electron package selection, but does not freeze whether profile preflight/resource selection applies across those supported package outputs. This could yield a Windows enterprise package and a Community macOS/Linux package from the same selected CI profile. | State that every supported package entry point applies the same selected enterprise/Community profile preparation before Electron packaging. Keep Windows as the required final-package proof in this stage; add an observable AC and evidence claim for cross-entry-point profile preparation. |

## Minor Findings

None.

## Closure Table

| Finding | Status |
|---|---|
| M1 | OPEN |

## Conclusion

Return to `smc-prd-grounding` revision mode. Only M1 and its direct behaviour, AC, and evidence consequences need revision; the approved ownership and RM-02 boundary remain closed.
