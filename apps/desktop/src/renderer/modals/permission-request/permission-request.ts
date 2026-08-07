/**
 * Permission Request Modal
 * 
 * Displays permission requests for secure IPC channels.
 * User can grant or deny permissions with optional "remember my choice".
 */

// Permission types and icons
const PERMISSION_ICONS: Record<string, string> = {
  "shell.execute": "🖥️",
  "shell.spawn": "⚙️",
  "fs.read": "📖",
  "fs.write": "✍️",
  "fs.delete": "🗑️",
  "clipboard.read": "📋",
  "clipboard.write": "📎",
  "notification.send": "🔔",
  "dialog.open": "📂",
  "dialog.save": "💾",
  "http.external": "🌐",
  "webcam.access": "📹",
  "microphone.access": "🎤",
  "screen.capture": "📺",
  "geolocation": "📍",
};

const PERMISSION_NAMES: Record<string, string> = {
  "shell.execute": "Execute Shell Commands",
  "shell.spawn": "Spawn Processes",
  "fs.read": "Read Files",
  "fs.write": "Write Files",
  "fs.delete": "Delete Files",
  "clipboard.read": "Read Clipboard",
  "clipboard.write": "Write to Clipboard",
  "notification.send": "Send Notifications",
  "dialog.open": "Open File Dialogs",
  "dialog.save": "Save File Dialogs",
  "http.external": "Make External Requests",
  "webcam.access": "Access Webcam",
  "microphone.access": "Access Microphone",
  "screen.capture": "Capture Screen",
  "geolocation": "Access Location",
};

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "shell.execute": "Execute arbitrary shell commands on your system",
  "shell.spawn": "Launch and manage system processes",
  "fs.read": "Read files from your computer",
  "fs.write": "Create or modify files on your computer",
  "fs.delete": "Delete files from your computer",
  "clipboard.read": "Access your clipboard contents",
  "clipboard.write": "Copy text to your clipboard",
  "notification.send": "Show desktop notifications",
  "dialog.open": "Open system file picker dialogs",
  "dialog.save": "Open save file dialogs",
  "http.external": "Send data to external servers",
  "webcam.access": "Access your camera",
  "microphone.access": "Access your microphone",
  "screen.capture": "Record or screenshot your screen",
  "geolocation": "Access your location information",
};

interface PermissionData {
  origin: string;
  permissions: string[];
  requestId: string;
  rememberByDefault?: boolean;
}

let currentData: PermissionData | null = null;

// Get permission data from internal API
async function getPermissionData(): Promise<PermissionData | null> {
  try {
    const data = await window.internalView?.getData?.();
    if (data && data.origin && data.permissions) {
      return data as PermissionData;
    }
  } catch (err) {
    console.error("[PERMISSION] Failed to get data:", err);
  }
  return null;
}

// Render permission item
function renderPermission(permission: string): string {
  const icon = PERMISSION_ICONS[permission] || "🔒";
  const name = PERMISSION_NAMES[permission] || permission;
  const desc = PERMISSION_DESCRIPTIONS[permission] || permission;
  
  return `
    <div class="permission-item">
      <span class="permission-icon">${icon}</span>
      <div class="permission-info">
        <div class="permission-name">${name}</div>
        <div class="permission-desc">${desc}</div>
      </div>
    </div>
  `;
}

// Render the modal
function renderModal(data: PermissionData): void {
  const permissionsHtml = data.permissions.map(renderPermission).join("");
  
  document.getElementById("app")!.innerHTML = `
    <div class="modal">
      <div class="header">
        <div class="icon">🔒</div>
        <div class="title">
          <h2>Permission Required</h2>
          <p>${data.permissions.length} permission${data.permissions.length > 1 ? "s" : ""} requested</p>
        </div>
      </div>
      
      <div class="content">
        ${permissionsHtml}
      </div>
      
      <div class="origin">
        <div class="origin-label">Requesting Origin</div>
        <div class="origin-url">${escapeHtml(data.origin)}</div>
      </div>
      
      <label class="remember">
        <input type="checkbox" id="remember" ${data.rememberByDefault ? "checked" : ""}>
        <span>Remember my choice for this site</span>
      </label>
      
      <div class="buttons" style="margin-top: 20px;">
        <button class="btn-secondary" onclick="deny()">Deny</button>
        <button class="btn-primary" onclick="allow()">Allow</button>
      </div>
    </div>
  `;
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Allow permissions
function allow(): void {
  const remember = (document.getElementById("remember") as HTMLInputElement)?.checked ?? false;
  
  window.internalView?.confirm?.({
    granted: true,
    remember,
    permissions: currentData?.permissions ?? [],
  });
}

// Deny permissions
function deny(): void {
  const remember = (document.getElementById("remember") as HTMLInputElement)?.checked ?? false;
  
  window.internalView?.confirm?.({
    granted: false,
    remember,
    permissions: [],
  });
}

// Block permissions (permanent deny)
function block(): void {
  window.internalView?.confirm?.({
    granted: false,
    remember: true,
    permissions: [],
    blocked: true,
  });
}

// Initialize
async function init(): Promise<void> {
  const data = await getPermissionData();
  if (!data) {
    document.getElementById("app")!.innerHTML = `
      <div class="modal">
        <div class="header">
          <div class="icon" style="background: rgba(239, 68, 68, 0.1);">❌</div>
          <div class="title">
            <h2>Error</h2>
            <p>Failed to load permission data</p>
          </div>
        </div>
        <div class="buttons">
          <button class="btn-secondary" onclick="window.internalView?.close?.()">Close</button>
        </div>
      </div>
    `;
    return;
  }
  
  currentData = data;
  renderModal(data);
}

// Expose functions to window for onclick handlers
(window as unknown as { allow: () => void; deny: () => void; block: () => void }).allow = allow;
(window as unknown as { allow: () => void; deny: () => void; block: () => void }).deny = deny;
(window as unknown as { allow: () => void; deny: () => void; block: () => void }).block = block;

// Handle escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    deny();
  }
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
