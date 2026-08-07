/**
 * Update Ready Modal
 *
 * 显示可用更新，允许用户选择立即安装或稍后提醒。
 */

// Modal 数据接口
interface UpdateReadyData {
  version: string;
  currentVersion?: string;
  releaseNotes?: string;
}

// 等待 internalView API 就绪
async function init(): Promise<void> {
  // 等待一小段时间确保 preload 已注入
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 检查 API 是否可用
  if (!window.internalView) {
    console.error("[UpdateReady] internalView API not available");
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center; color: red;">
        Error: Cannot connect to main process
      </div>
    `;
    return;
  }

  try {
    // 获取传入的数据
    const data = (await window.internalView.getData()) as
      | UpdateReadyData
      | undefined;

    // 初始化 UI
    initUI(data);

    // 通知主进程 Modal 已准备好
    await window.internalView.ready();
  } catch (err) {
    console.error("[UpdateReady] Failed to initialize:", err);
  }
}

// 初始化 UI
function initUI(data?: UpdateReadyData): void {
  const newVersionEl = document.getElementById("newVersion");
  const currentVersionEl = document.getElementById("currentVersion");
  const releaseNotesEl = document.getElementById("releaseNotes");
  const releaseNotesContainerEl = document.getElementById(
    "releaseNotesContainer",
  );
  const laterBtn = document.getElementById("laterBtn");
  const installBtn = document.getElementById("installBtn");
  const modalOverlay = document.getElementById("modalOverlay");

  // 设置版本信息
  if (newVersionEl && data?.version) {
    newVersionEl.textContent = data.version;
  }

  if (currentVersionEl) {
    if (data?.currentVersion) {
      currentVersionEl.textContent = data.currentVersion;
    } else {
      // 尝试从 URL 参数获取当前版本
      const urlParams = new URLSearchParams(window.location.search);
      const currentVersion = urlParams.get("currentVersion");
      if (currentVersion) {
        currentVersionEl.textContent = currentVersion;
      } else {
        currentVersionEl.textContent = "Unknown";
      }
    }
  }

  // 设置发布说明
  if (releaseNotesEl && releaseNotesContainerEl && data?.releaseNotes) {
    releaseNotesEl.textContent = data.releaseNotes;
    releaseNotesContainerEl.style.display = "block";
  }

  // 绑定按钮事件
  laterBtn?.addEventListener("click", () => {
    window.internalView?.close("later");
  });

  installBtn?.addEventListener("click", () => {
    window.internalView?.confirm("install");
  });

  // 点击遮罩层关闭（可选）
  modalOverlay?.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      // 可选：点击外部关闭
      // window.internalView?.close("dismissed");
    }
  });

  // ESC 键关闭
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.internalView?.close("later");
    }
  });
}

// 启动
init();

// 处理主进程发送的数据更新
window.addEventListener("message", (event) => {
  if (event.data?.type === "modal:data") {
    initUI(event.data.payload as UpdateReadyData);
  }
});
