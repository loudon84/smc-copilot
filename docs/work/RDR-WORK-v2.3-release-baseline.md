# RDR-WORK-v2.3 — Windows Release Baseline

**状态：** 已确认（VER-01 已分发）
**产品：** SMC-Copilot (`apps/work`)
**正式 Feed：** `https://release.superic.com/work/stable/`
**下一正式版：** `0.7.5`

本记录冻结 v2.3 生产闭环的版本、身份迁移与发布门禁决策。代码实现不得覆盖已分发的 `0.7.4` artifact。

## VER-01 — 0.7.4 不可变

`0.7.4` 已向测试/生产终端分发。下列产物只读，禁止重新生成同名安装包：

- `smc-copilot-0.7.4-setup.exe`
- `smc-copilot-0.7.4-setup.exe.blockmap`
- `latest.yml`（当时 stable 指针）
- 对应 `SHA256SUMS.txt` / `release-manifest.json`

v2.3 生产闭环版本为 **0.7.5**。N→N+1 验收路线为 **0.7.4 → 0.7.5**。

## CUTOVER-01 — Internal Generic Feed

唯一正式更新源：

```text
https://release.superic.com/work/stable/
```

发布前必须核对其冻结的 0.7.4 包内 `app-update.yml`：

- 若 `provider: generic` 且 URL 已是上述地址：0.7.4 客户端走原地升级。
- 若仍指向 GitHub：必须先用**同身份** Bridge 把 Feed 切到内网，不能靠改 appId 让旧客户端自己发现新服务器。

GitHub Provider 不再作为生产 Feed。

## IDM-01 — 安装身份

历史身份与当前身份不是普通 Electron 小版本升级：

| 项 | Legacy（pre-0.7.4） | Current（0.7.4+） |
| --- | --- | --- |
| appId | `com.nousresearch.hermes` | `com.smc.copilot` |
| executable | `copilot-desktop.exe` | `smc-copilot.exe` |
| scope | per-user | per-machine |

决策：

- **已是 0.7.4 SMC-Copilot：** NSIS 原地升级到 0.7.5（同 appId / exe / per-machine）。
- **pre-0.7.4 旧身份：** Bootstrap 安装 `smc-copilot-0.7.5-setup.exe`。安装器检测旧安装、Main 迁移 userData、安装后卸载旧产品，避免双安装残留。

## Publisher / 签名 / 不可变目录

生产发布要求：

- Authenticode `Status = Valid`
- Publisher 匹配 `SMC_WORK_EXPECTED_PUBLISHER`（secret，不入库）
- `latest.yml.sha512` 等于最终已签名 installer 的 Base64(SHA512)
- `/work/releases/<version>` 只写一次；已存在则拒绝覆盖
- `stable` 只是指针；回滚只改指针，已升级客户端不自动降级

所需 secrets（不提交值）：`SMC_WORK_UPDATE_URL`、`SMC_WORK_EXPECTED_PUBLISHER`、Authenticode（`CSC_LINK` / `CSC_KEY_PASSWORD` 或企业 signtool）、发布 SSH。

## 人工 Gate（本仓库无法关闭）

下列 DoD 项保持未完成，直到运维/QA 签字：

- [ ] 冻结的 0.7.4 `app-update.yml` 已核对
- [ ] Production DNS / TLS / 企业网络可访问 Feed
- [ ] Authenticode 生产证书签名 0.7.5
- [ ] Windows 10 x64：0.7.4 → 0.7.5
- [ ] Windows 11 x64：0.7.4 → 0.7.5
- [ ] 旧身份 Bootstrap、自定义目录、Later+Quit 不安装
- [ ] Stable Promote 经人工授权
