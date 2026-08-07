# Hermes Runtime 版本管理

各版本并排安装在 `HERMES_INSTALL_DIR/<version>/`（Windows 默认 `D:\Programs\HermesAgent/<version>/`）；未配置安装根时回退 Runtime 服务态下的 `versions/<version>/`（服务态根：Windows `%LOCALAPPDATA%\HermesRuntime`）。

当前激活指针：`active.json`（原子替换写入）。

## 接口

- `GET /api/v1/runtime/versions`
- `POST /api/v1/runtime/update`
- `POST /api/v1/runtime/rollback`
- `DELETE /api/v1/runtime/versions/{version}`（禁止删除 active / 被固定引用的版本）

`RUNTIME_MAX_OLD_VERSIONS` 控制成功更新后对 inactive 旧版本的清理数量。

更新失败时恢复为先前的 active 版本。
