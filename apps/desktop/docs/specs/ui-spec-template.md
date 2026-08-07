# UI Spec: <ScreenName>

## 1. 背景
这个页面解决什么问题。

## 2. 用户目标
用户进入页面后要完成哪些任务。

## 3. 页面入口
- 路由 / View 名称：
- 左侧导航名称：
- 是否需要 profileId：
- 是否只在 Windows 显示：

## 4. 信息架构
页面分为几个区域：
- Header
- Summary Cards
- Main Panel
- Detail Drawer
- Logs / Timeline
- Footer Actions

## 5. 组件树
<ScreenName>
  ├─ <Header>
  ├─ <StatusCards>
  ├─ <PrimaryPanel>
  ├─ <ConfigForm>
  ├─ <LogPanel>
  └─ <ActionBar>

## 6. 数据来源
来自 window.hermesAPI 的哪些方法：
- hermesAPI.xxx()
- hermesAPI.yyy()

## 7. 状态模型
- idle
- loading
- ready
- saving
- error
- success

## 8. 交互流程
1. 用户打开页面
2. 加载配置
3. 展示状态
4. 用户修改配置
5. 点击保存
6. 调用 hermesAPI
7. 成功后刷新
8. 失败时显示错误

## 9. 空状态 / 错误态
- 没有数据时显示什么
- IPC 调用失败时显示什么
- 本地依赖缺失时显示什么

## 10. 视觉要求
- 桌面端优先
- 左右结构 / 卡片结构 / 表格结构
- 主按钮位置
- 高风险操作样式
- 日志区域是否 monospace

## 11. 文件变更范围
允许修改：
- src/renderer/src/screens/<ScreenName>/**
- src/renderer/src/components/<Feature>/**
- src/preload/index.ts
- src/preload/index.d.ts
- src/main/index.ts
- src/main/<module>.ts

禁止修改：
- app bootstrap
- unrelated screens
- package manager config
- global architecture

## 12. 验收标准
- 页面能编译
- TypeScript 无 any
- loading/empty/error 都可见
- 主流程可跑通
- 不破坏现有 Layout