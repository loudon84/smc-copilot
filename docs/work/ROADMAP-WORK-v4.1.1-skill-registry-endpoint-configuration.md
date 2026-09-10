---
roadmap_id: ROADMAP-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION
version: 1.0.0
status: ACTIVE
architecture_decision: docs/work/AD-WORK-v4.1.1-skill-registry-endpoint-configuration.md
source_revision: AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION@1.0.1
target_branch: work/prd-v4.1
updated_at: 2026-09-10T05:15:17.578394Z
implementation_plan_required: true
---

# WORK v4.1.1 Skill Registry Endpoint Configuration Roadmap

本 Roadmap 将完整 Registry Endpoint Descriptor 分成运行时消费边界和企业打包证据两个阶段；它不重开已完成的 v4.0.1 Skill-First Roadmap。

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | Registry Descriptor & Main Consumer：定义完整 Endpoint Descriptor、来源优先级和失败语义，并让现有 Main Registry owner 统一消费。架构出处：AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION。 | - | DONE | default/runtime/build source 矩阵通过；显式无效配置 fail closed；catalog、models、detail、tree、download、homepage、icons 使用同一 descriptor identity；缓存不跨 source；Renderer 不获得 URL/新配置 IPC；Hermes Runtime descriptor、Agent/CLI 和 Skill Run contract 不变。 | docs/work/PRD-WORK-v4.1.1-M1-registry-descriptor-main-consumer.md | .cursor/plans/work-v4.1.1-m1-registry-descriptor-main-consumer.plan.md | 2e2b19a176d5c88e96fad5ea9e99332653a288f8 | smc-evidence:WORK-V4.1.1-REGISTRY-RM-01@sha256:bc43e6d0baf3b372c389b7d5a9521613fc1b69d9f9249ef3a1c132c98e5306e0 |
| RM-02 | Enterprise Build Profile & Package Proof：把完整企业 descriptor 确定性注入 Electron package 并验证安装包资源。架构出处：AD-WORK-v4.1.1-SKILL-REGISTRY-ENDPOINT-CONFIGURATION。 | RM-01 | BACKLOG | 企业 profile 提供完整 endpoint 集合并通过 preflight；构建产物包含匹配 descriptor；Community 包保持公共默认；企业 profile 缺字段时构建失败；产物与日志无 secret；Windows package evidence 通过。 | - | - | - | - |

## Outcome

RM-01 DONE 后，Work 的既有 Registry owner 可从完整、已校验且来源可追踪的 descriptor 读取整个 Discover Registry。RM-02 DONE 后，不同 Electron 发行包可稳定选择公共或企业 Registry，并能从最终 package 验证选择结果。

Registry 审核、发布、签名、权限/认证协议、仓库治理、Hermes Agent/CLI 修改及 Skill Run wire contract 均不属于本 Roadmap。
