# Architecture Convergence Checklist

Use this checklist for PRD review, planning, and staged review.

- [ ] 一个 Capability 只有一个 Production Owner。
- [ ] 每个 REPLACE 都有对应的 REMOVE 和明确 removal condition。
- [ ] 没有无期限 Legacy。
- [ ] Compat、adapter、fallback、alias 有当前 Consumer、原因、移除条件和版本。
- [ ] 历史 Bug 只在 tests/fixtures、golden input 或 golden output 中保存。
- [ ] 没有 duplicate parser、serializer、adapter 或 lifecycle owner。
- [ ] 每个新增生产文件都有现有 owner 不能承担的理由。
