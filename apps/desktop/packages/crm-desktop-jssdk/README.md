# crm-desktop-jssdk

独立交付给 CRM Web 系统安装的 JS SDK，用于在 **Electron WebOperator WebContentsView** 环境中把“用户主动点击触发的上下文”提交给 Copilot Desktop，并接收 Desktop 下发命令。

## 使用方式（IIFE）

```html
<script src="/static/crm-desktop-jssdk.iife.js"></script>
```

```html
<button id="sync-to-desktop">同步到桌面助手</button>
<script>
  document.getElementById("sync-to-desktop").addEventListener("click", async () => {
    const result = await window.CopilotCrmDesktopSDK.submitPageContext(
      {
        app: "crm",
        entityType: "customer",
        entityId: "1001",
        entityName: "ACME",
        safeText: document.body.innerText.slice(0, 5000),
      },
      { sourceModule: "customer-detail" },
      { triggerElementId: "sync-to-desktop", triggerLabel: "同步到桌面助手" }
    );
    console.log(result);
  });
</script>
```

## 接收 Desktop 命令

```js
window.CopilotCrmDesktopSDK.onCommand((command) => {
  if (command.type === "desktop.crm.showToast") {
    alert(command.payload?.message || "Desktop command received");
  }
});
```

## 行为说明

- 在普通浏览器环境中：`window.CopilotDesktopCRM` 不存在，SDK 会退化为 `window.postMessage` 并返回 `ok:false` 的提示信息。
- 在 Electron WebOperator 环境中：Desktop preload 会注入 `window.CopilotDesktopCRM.emit`，SDK 会直接调用该方法以走可信 IPC 通道。

