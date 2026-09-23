---
work_item_id: REL-17
version: v0.1.0-draft
status: PRD-DRAFT
target_branch: work/prd-v2.3.1
parent_prd: docs/work/PRD-WORK-v2.3-auto-update-hardening.md
amends:
  - docs/work/PRD-WORK-v2.2-release-lifecycle-closure.md
  - docs/work/PRD-WORK-v2.3-auto-update-hardening.md
  - docs/work/RDR-WORK-v2.3-release-baseline.md
decision_date: 2026-09-22
---

# WORK PRD v2.3.1 — 内部发布暂停 Authenticode 签名门（临时豁免）

本 PRD 只做一件事：**在公司无法提供代码签名证书期间，允许未签名的 Work 安装包通过官方 `release:build:win` / `release:publish` 链路进入 `stable`**。版本控制门禁（不可变目录、staging → promote、原子切换、SHA256/sha512 校验、发布后回读确认）全部保留，一项不减。

## 1. 背景与决策缘由

v2.2 / v2.3 将 Authenticode 签名设为生产发布的硬门（`PUBLISH_DENIED`），其前提是公司持有代码签名证书。2026-09-22 经与公司确认：

- 公司**没有**代码签名证书；
- 公司非软件公司，产品全部内部使用，**大概率不会采购**（OV 证书年费千元级且需营业执照验证、私钥须存于 USB token 或云签名服务，采购与保管流程与收益不成比例）；
- 因此签名门不是「暂时没配好」，而是「在可预见的将来都不会有」。继续保留它等于发布链路永久不可用。

签名的实际收益（SmartScreen 不再提示「未知发布者」、杀软误报率下降、electron-updater 发布者校验）在内部分发场景下由既有措施承担：固定安装目录 + 杀软白名单 + 员工按内部指引安装。

## 2. 事实基线（Evidence）

| 项 | 事实 | 出处 |
|---|---|---|
| 同厂先例已跑通 | AutoTask 与 Work 共用同一台发布机、同一套 `staging → releases → stable` 结构、同构的 promote 脚本（同样的 `PROMOTION_FAILED` 错误码、相对软链、`RELEASE_ALREADY_EXISTS`）。其门禁 = 产物齐全 + SHA256SUMS + latest.yml sha512，**不验签名**。0.1.26 已在 `autotask/stable` 上线并正常在线更新 | `autotask-workspace/app/scripts/server/promote-autotask-release.sh`；`autotask-workspace/project-docs/PROJECT_CONTROL.md:64`；实测 `https://release.superic.com/autotask/stable/latest.yml` 返回 200 |
| Work 链路本已支持未签名 | `build-work-release.ps1:81-84` 识别 `SMC_WORK_RELEASE_ALLOW_UNSIGNED=1`，跳过验签并将 manifest 写为 `signed: false`；`validate-work-release.ps1:24-26,89-98` 同样跳过 | 仓库源码 |
| 硬堵点仅两处 | ① `publish-work-release.ps1:30-31`：`ALLOW_UNSIGNED=1` 时直接 `PUBLISH_DENIED`；② 服务器 `assert-work-release.sh:66-69`：grep `release-manifest.json` 的 `"signed": true`，不符则 `RELEASE_GATE_FAILED: MANIFEST_UNSIGNED` | 仓库源码 |
| 客户端无需改动 | 打包产物 `app-update.yml` 仅含 `provider/url/channel/updaterCacheDirName`，**无 `publisherName`**；electron-updater 在 Windows 上仅当 `publisherName` 存在时才校验下载包签名，缺失则跳过。AutoTask 未签名包在线更新正常即为现网实证 | 实测 `dist/win-unpacked/resources/app-update.yml`；AutoTask 现网 |
| 原签名门的实际强度 | 服务器端「验签」实为 grep 构建方自述的 manifest 字段，非密码学校验；本地三次 `Get-AuthenticodeSignature` 验的是同一文件。豁免该门不降低任何真实安全边界；在途保护仍由 HTTPS + `latest.yml` sha512 承担（与 AutoTask 相同） | 源码分析，详见 §5 |

## 3. 决策（Decision）

**D1：暂停签名门，保留全部版本控制门。** `stable` 通道在证书缺位期间接受未签名发布；`releases/<version>` 不可覆盖、`stable` 原子切换、staging 完整性校验、发布后 GET `latest.yml` + HEAD 安装包确认，全部维持现状。

**D2：豁免以显式开关表达，不删除签名代码。** 本地用既有 `SMC_WORK_RELEASE_ALLOW_UNSIGNED=1`；服务器端新增 `SMC_WORK_REQUIRE_SIGNED`（缺省 `0`）。签名相关代码路径全部保留，供证书到位后立即恢复。

**D3：恢复条件。** 公司购入证书后：签名机/CI 配置 `CSC_LINK`/`CSC_KEY_PASSWORD` 或企业 signtool → 服务器 `SMC_WORK_REQUIRE_SIGNED=1` → 本地移除 `ALLOW_UNSIGNED` → 设置 `SMC_WORK_EXPECTED_PUBLISHER`。代码零改动。

## 4. Scope

### In（全部改动，共两处 + 一项部署）

1. `apps/work/scripts/publish-work-release.ps1` — `Assert-PublishableRelease`：`ALLOW_UNSIGNED=1` 时由硬拒改为放行（要求 manifest 如实为 `signed: false`，打印 Warning）；签名路径逻辑不变。
2. `infra/release-server/scripts/assert-work-release.sh` — `MANIFEST_UNSIGNED` 检查包入 `if [ "${SMC_WORK_REQUIRE_SIGNED:-0}" = "1" ]` 条件块，缺省不启用。
3. 将更新后的 `assert-work-release.sh` 部署到发布机 promote 脚本同目录（一条 scp，属正常部署而非手工改数据目录）。

### Out（明确不做）

- 不改 `build/installer.nsh`（默认安装目录的 `FileExists "D:\"` 问题另案处理，与本豁免无关）；
- 不改 electron-updater 配置、不新增 `publisherName`（一旦加入，后续所有更新包必须签名，与 D3 恢复路径冲突时另行评估）；
- 不改 `staging/releases/stable` 目录结构与 nginx 配置；
- 不删除签名校验代码、不放宽 sha256/sha512/不可变目录任何一项；
- 不处理 SmartScreen 提示（由内部安装指引与杀软白名单承担）。

## 5. 风险与承担

| 风险 | 评估 | 承担方式 |
|---|---|---|
| 员工安装时 SmartScreen「未知发布者」蓝框 | 内部分发、固定受众，可预期 | 安装指引注明「仍要运行」；杀软白名单已覆盖固定安装目录 |
| 未签名包被替换后客户端无感 | 在途有 HTTPS + sha512；服务器可写面 = 发布 SSH 账号，与签名门无关（原门为自述字段 grep，见 §2） | 发布机 SSH 密钥按人分发、最小权限；`releases/` 不可覆盖 |
| 豁免被忘记，永久化 | D3 写了恢复条件但无人触发 | 本 PRD status 保持可检索；证书到位即按 D3 执行，代码无需再改 |

## 6. 验收（Acceptance）

- AC-1：`SMC_WORK_RELEASE_ALLOW_UNSIGNED=1` 下 `npm run release:build:win` 产出完整 `release/work/<version>/`，manifest `signed: false`，`release:validate` 通过。
- AC-2：`npm run release:publish` 全流程通过：scp 入 staging → 服务器 promote → `stable` 切换 → 脚本回读 `latest.yml` 200 且 version 匹配、安装包 HEAD 200。
- AC-3：服务器 `SMC_WORK_REQUIRE_SIGNED=1` 时，未签名发布仍被 `MANIFEST_UNSIGNED` 拒绝（开关有效性）。
- AC-4：实机 N→N+1：安装较低版本 → 检测 → 下载 → 安装成功（签名相关错误码 `SIGNATURE_INVALID` 不出现）。
- AC-5：重复发布同版本被 `RELEASE_ALREADY_EXISTS` 拒绝（版本控制门未受豁免影响）。

## 7. 分支与合并

按仓库惯例新建 `work/prd-v2.3.1` 分支实施，完成后合并回 `main`。构建脚本不限制分支（仅要求 git 树干净），`release-manifest.json` 会记录构建时的 branch 与 commit；为保证线上版本可追溯到 main，**先合并再正式发布**，或发布后立即合并且不回滚该 commit。合并用普通 merge / fast-forward，不用 squash（保持 manifest 中的 commit 哈希有效）。
