# AD-WORK-v4.1.1 Skill Registry Endpoint Configuration v1.0.1 — Architecture Review

**Mode:** initial revision review  
**Verdict:** PASS

## Blocking Findings

None.

## Major Findings

None.

## Review Scope

This review checks the Plan-grounding correction introduced after source inspection showed that Registry icons are existing Renderer `<img>` requests and the Work CSP permits only HTTPS remote images. Previously PASS ownership, descriptor, source-precedence and Roadmap decisions are reused.

## Gate Results

| Gate | Result | Rationale |
|---|---|---|
| A1 Problem Necessity | PASS | Enterprise Registry configurability remains demonstrated; the revision only corrects an inaccurate current-boundary statement. |
| A2 Existing Capability / Reuse | PASS | Existing derived homepage/HTTPS icon fields and Renderer presentation are retained; no Main proxy or new IPC is added. |
| A3 Alternatives | PASS | Broad HTTP image CSP and a new icon proxy are explicitly rejected through the HTTPS-only optional icon boundary. |
| A4 Ownership / Boundary | PASS | Main still owns source/descriptor/catalog/content; Renderer receives only derived item fields and cannot select or inspect the descriptor. |
| A5 Dependencies / Cascading Effects | PASS | HTTP enterprise registries may omit icons; RM-01 cannot loosen CSP and RM-02 must provide HTTPS icons or none. |
| A6 Security / Operability | PASS | HTTPS-only remote icons preserve current CSP; catalog/content may still use the explicitly approved Main-only HTTP endpoint. |
| A7 Pre-mortem / Kill Criteria | PASS | Any requirement for HTTP Renderer images or Main icon proxy returns to Architecture. |
| A8 Roadmap Decomposability | PASS | RM-01/RM-02 boundaries remain unchanged. |

## Conclusion

Version 1.0.1 accurately preserves the existing icon presentation exception without weakening source ownership or CSP. It may converge to APPROVED.
