# AD-WORK-v4.1.1 Skill Registry Endpoint Configuration — Architecture Review

**Mode:** initial  
**Verdict:** PASS

## Blocking Findings

None.

## Major Findings

None.

## Minor Findings

None.

## Roadmap Notes

- RM-01 可使用公共默认 descriptor、runtime fixture 和受控 fake transport 完成 Registry consumer contract；不得把尚未提供的企业 endpoint 值伪造成生产证据。
- RM-02 在企业方提供完整 endpoint 集合及其响应兼容性之前保持 BACKLOG。一个 `.git` clone URL 不能满足 READY 条件。
- Stage PRD 应把 index/models/tree/content 的既有响应 shape、URL bounds、cache identity 和 sanitized error 变成可测试行为，但不把具体新文件名提前写成架构要求。
- 可选 icon endpoint 缺失时应得到无图标的正常 catalog 项，而不是回落到公共 icon 服务。

## Closure Table

| Gate | Result | Rationale |
|---|---|---|
| A1 Problem Necessity | PASS | 当前 GitHub 专用常量与企业发行包要求之间存在已证明的配置缺口。 |
| A2 Existing Capability / Reuse | PASS | Decision 扩展现有 Main Registry owner 与现有 build resource pipeline，没有新增 Registry client 或 Runtime Config owner。 |
| A3 Alternatives | PASS | 完整 descriptor、URL 推导、runtime clone、复用 Runtime Descriptor 和 skills-only 均有明确取舍。 |
| A4 Ownership / Boundary | PASS | Main 持有 endpoint 与网络/文件边界；Renderer 不获得 URL 或 filesystem 权限；Managed Runtime owner 保持不变。 |
| A5 Dependencies / Cascading Effects | PASS | 全 catalog 混源风险、cache invalidation、build/runtime precedence 与 package verification 顺序均已冻结。 |
| A6 Security / Operability | PASS | 协议、userinfo、secret、sanitized error、source observability 和 fail-closed 规则足够驱动 PRD。 |
| A7 Pre-mortem / Kill Criteria | PASS | clone-only、混源、优先级绕过、第二 owner 与 provider-specific URL guessing 都有停止条件。 |
| A8 Roadmap Decomposability | PASS | Runtime consumer contract 与 enterprise package proof 分为两个稳定 outcome；RM-02 有明确外部门禁。 |

## Conclusion

Decision 可进入 converge。选择完整 Endpoint Descriptor 能在不修改 Hermes Agent/CLI、Managed Runtime descriptor 或 Renderer boundary 的前提下复用现有 Registry owner。评审未发现需要 revision 的 BLOCKER 或 MAJOR。
