# Install 组件族

> `components/install/` + `components/install-wizard/`

Agent 安装向导与 PyPI 镜像配置。

## PipMirrorFields

**文件**：`components/install/PipMirrorFields.tsx`

PyPI 镜像预设选择器，用于安装向导中选择 pip 安装源。

### Props

| 字段 | 类型 | 说明 |
|---|---|---|
| `value` | `PipMirrorSelection` | 当前选中值（`pipMirrorPreset` / `pipIndexUrl` / `trustedHost`） |
| `onChange` | `(next: PipMirrorSelection) => void` | 变更回调 |

### PipMirrorSelection

```ts
interface PipMirrorSelection {
  pipMirrorPreset: PipMirrorPresetId;  // "tsinghua" | "aliyun" | "tencent" | "official" | "custom"
  pipIndexUrl: string;
  trustedHost: string;
}
```

### 预设列表

来自 `shared/enterprise/pip-mirror-presets.ts` 的 `PIP_MIRROR_PRESETS`：清华、阿里、腾讯、官方、自定义。

### 行为

- 选择预设 → `resolvePipMirrorFromPreset` 自动填入 `pipIndexUrl` / `trustedHost`
- 选择「自定义」→ 展开 URL 和 trustedHost 输入框
- `createDefaultPipMirrorSelection()` 工厂函数默认清华源

## InstallWizard

**文件**：`components/install-wizard/install-wizard.tsx`

Agent 安装向导，引导用户选择安装源并执行安装。

### Props

| 字段 | 类型 | 说明 |
|---|---|---|
| `onComplete` | `() => void` | 安装完成回调 |
| `onCancel` | `() => void?` | 取消回调（可选，有则显示关闭按钮） |

### 阶段状态机

```
detect → select-source → installing → verifying → completed
                                              → error → select-source (retry)
```

| 阶段 | UI | 说明 |
|---|---|---|
| `detect` | Spinner + "检测安装中…" | `hermesAPI.firstRunWizardDetectAgent()` |
| `select-source` | 源选择 + PipMirrorFields | 用户选 local-zip 或 git-clone，配置镜像 |
| `installing` | Spinner + 进度消息 | `hermesAPI.startInstallWithSource(config)`，订阅 `onInstallProgress` |
| `verifying` | Spinner + "验证中…" | 安装后验证 |
| `completed` | ✓ + "安装完成" + 启动按钮 | 调用 `onComplete` |
| `error` | ⚠ + 错误信息 + 重试按钮 | 回退到 `select-source` |

### 安装配置

```ts
{
  sourceType: "local-zip" | "git-clone";
  localZipPath?: string;    // local-zip 时的 ZIP 路径
  gitUrl?: string;          // git-clone 时的仓库 URL
  gitBranch?: string;       // 分支（默认 main）
  gitShallow?: boolean;     // 浅克隆（默认 true）
  pipMirrorPreset: PipMirrorPresetId;
  pipIndexUrl: string;
  trustedHost: string;
}
```
