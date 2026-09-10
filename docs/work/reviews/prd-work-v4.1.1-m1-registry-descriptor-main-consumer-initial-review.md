# WORK v4.1.1 M1 Registry Descriptor & Main Consumer — Initial PRD Review

Review scope is RM-01 Stage PRD v1.0.0 (`REVIEW_REQUIRED`) grounded at `2afa1963934432cae28c1000e91a678d739c6a8d`. It reuses the PRD Evidence Baseline and Source Anchors and does not re-scan unrelated Work domains.

## Verdict

REVISE

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | RM-01 is limited to descriptor/runtime consumption; enterprise profile generation and package proof remain RM-02. |
| G2 Existing Capability | PASS | Existing Main Registry owner, caches and IPC are extended; no second client/store/Renderer owner is proposed. |
| G3 Production Ownership | PASS | Descriptor validation feeds the existing Registry owner and remains separate from Managed Hermes Runtime configuration. |
| G4 Classification | PASS | ADD is limited to missing descriptor/source resolution; network/cache/error behavior is MODIFY and unrelated domains are KEEP. |
| G5 Contract/Security Boundary | REVISE | The runtime descriptor has no stable external ingress contract, and `treeUrl` permits an unspecified normalization that could become a provider-specific adapter in Plan. |
| G6 Behaviour to AC | REVISE | AC-02 cannot be exercised externally until runtime injection is named and typed; AC-04 cannot prove provider-neutral behavior without an exact tree response shape. |
| G7 Evidence Integrity | PASS | Existing failures remain residual gaps and affected prior proof is targeted; no blocking FAIL is deferred. |

## Blocking Findings

None.

## Major Findings

| ID | Finding | Required closure |
|---|---|---|
| M1 | “explicit Main-only runtime descriptor” does not define a stable configuration key or payload encoding. The source report named a single URL variable, but the approved Architecture replaced that with a complete descriptor. Leaving the ingress private would make runtime configuration non-operable and AC-02 non-reproducible. | Define one Main-only runtime environment contract carrying the full descriptor, including parse/absence/empty semantics. Explicitly state that the old single-URL proposal is not an accepted partial override. Update AC-02/AC-03 and evidence accordingly. |
| M2 | `treeUrl` says its response is “可规范化”, but no generic wire shape is frozen. A Plan could satisfy that sentence with hostname-based GitHub/GitLab branching, which the Architecture explicitly rejects. | Freeze a provider-neutral recursive tree response contract (or reuse the exact existing one) and define content path resolution sufficiently to test catalog/detail/download without host inference. Update AC-04. |

## Minor Findings

None.

## Roadmap Notes

- RM-02 must select the packaged resource filename/profile mechanism; RM-01 only needs a typed build-source consumer seam.
- Authentication remains out of scope. If the internal endpoint cannot be reached without credentials, RM-02 must stay BACKLOG and Architecture must be revisited.

## Closure Table

| Finding | Status |
|---|---|
| M1 | OPEN |
| M2 | OPEN |

## Conclusion

Return to `smc-prd-grounding` revision mode. Only M1/M2 and directly affected AC/evidence text should change; Owner, Roadmap split and approved Architecture direction remain closed.
