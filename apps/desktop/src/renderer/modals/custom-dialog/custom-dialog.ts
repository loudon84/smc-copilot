/**
 * Custom Dialog Modal
 * 
 * Flexible dialog that supports:
 * - Different types: info, warning, error, success, question
 * - Custom title and message
 * - Optional details (collapsible or always visible)
 * - Input fields (text, textarea, select, checkbox)
 * - Custom button labels
 */

import type { I18nKey, I18nValues } from "../../../shared/i18n/types";

// Dialog types with icons
type DialogType = "info" | "warning" | "error" | "success" | "question";

const TYPE_ICONS: Record<DialogType, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
  success: "✅",
  question: "❓",
};

const TYPE_TITLES: Record<DialogType, string> = {
  info: "Information",
  warning: "Warning",
  error: "Error",
  success: "Success",
  question: "Confirm",
};

// Input field types
interface InputField {
  id: string;
  type: "text" | "textarea" | "select" | "checkbox";
  label: string;
  placeholder?: string;
  value?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

// Dialog data
interface DialogData {
  type: DialogType;
  title?: string;
  message: string;
  details?: string;
  inputs?: InputField[];
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  danger?: boolean;
  autoFocus?: string;
}

let currentData: DialogData | null = null;

// Get dialog data from internal API
async function getDialogData(): Promise<DialogData | null> {
  try {
    const data = await window.internalView?.getData?.();
    if (data && data.message) {
      return data as DialogData;
    }
  } catch (err) {
    console.error("[DIALOG] Failed to get data:", err);
  }
  return null;
}

// Render input field
function renderInput(field: InputField): string {
  const requiredAttr = field.required ? ' required' : '';
  
  switch (field.type) {
    case "textarea":
      return `
        <div class="input-group">
          <label for="${field.id}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
          <textarea 
            id="${field.id}" 
            name="${field.id}"
            placeholder="${escapeHtml(field.placeholder || "")}"
            ${requiredAttr}
          >${escapeHtml(field.value || "")}</textarea>
        </div>
      `;
    
    case "select":
      const options = field.options?.map(opt => 
        `<option value="${escapeHtml(opt.value)}" ${opt.value === field.value ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
      ).join("") || "";
      return `
        <div class="input-group">
          <label for="${field.id}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
          <select id="${field.id}" name="${field.id}"${requiredAttr}>
            ${options}
          </select>
        </div>
      `;
    
    case "checkbox":
      const checked = field.value === "true" || field.value === "on" ? "checked" : "";
      return `
        <div class="checkbox-group">
          <input type="checkbox" id="${field.id}" name="${field.id}" ${checked}>
          <label for="${field.id}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
        </div>
      `;
    
    case "text":
    default:
      return `
        <div class="input-group">
          <label for="${field.id}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
          <input 
            type="text" 
            id="${field.id}" 
            name="${field.id}"
            value="${escapeHtml(field.value || "")}"
            placeholder="${escapeHtml(field.placeholder || "")}"
            ${requiredAttr}
          >
        </div>
      `;
  }
}

// Render the dialog
function renderDialog(data: DialogData): void {
  const type = data.type || "info";
  const icon = TYPE_ICONS[type];
  const defaultTitle = TYPE_TITLES[type];
  const title = data.title || defaultTitle;
  
  const inputsHtml = data.inputs?.map(renderInput).join("") || "";
  
  const detailsHtml = data.details 
    ? `<div class="details">${escapeHtml(data.details)}</div>` 
    : "";
  
  const cancelButton = data.showCancel !== false 
    ? `<button class="btn-secondary" onclick="cancel()">${escapeHtml(data.cancelLabel || "Cancel")}</button>` 
    : "";
  
  const confirmButtonClass = data.danger ? "btn-danger" : "btn-primary";
  
  document.getElementById("app")!.innerHTML = `
    <div class="modal">
      <div class="header">
        <div class="icon ${type}">${icon}</div>
        <div class="title">
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      
      <div class="message">${escapeHtml(data.message)}</div>
      
      ${detailsHtml}
      
      ${inputsHtml}
      
      <div class="buttons">
        ${cancelButton}
        <button class="${confirmButtonClass}" onclick="confirm()">${escapeHtml(data.confirmLabel || "OK")}</button>
      </div>
    </div>
  `;
  
  // Auto-focus
  if (data.autoFocus) {
    setTimeout(() => {
      const element = document.getElementById(data.autoFocus!);
      if (element) {
        element.focus();
        if (element instanceof HTMLInputElement) {
          element.select();
        }
      }
    }, 50);
  }
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Collect form values
function collectValues(): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  
  currentData?.inputs?.forEach(field => {
    const element = document.getElementById(field.id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (element) {
      if (field.type === "checkbox") {
        values[field.id] = (element as HTMLInputElement).checked;
      } else {
        values[field.id] = element.value;
      }
    }
  });
  
  return values;
}

// Confirm dialog
function confirm(): void {
  const values = collectValues();
  
  window.internalView?.confirm?.({
    confirmed: true,
    values,
  });
}

// Cancel dialog
function cancel(): void {
  window.internalView?.cancel?.("user_cancelled");
}

// Initialize
async function init(): Promise<void> {
  const data = await getDialogData();
  if (!data) {
    document.getElementById("app")!.innerHTML = `
      <div class="modal">
        <div class="header">
          <div class="icon error">❌</div>
          <div class="title">
            <h2>Error</h2>
          </div>
        </div>
        <div class="message">Failed to load dialog data</div>
        <div class="buttons">
          <button class="btn-secondary" onclick="window.internalView?.close?.()">Close</button>
        </div>
      </div>
    `;
    return;
  }
  
  currentData = data;
  renderDialog(data);
}

// Expose functions to window for onclick handlers
(window as unknown as { confirm: () => void; cancel: () => void }).confirm = confirm;
(window as unknown as { confirm: () => void; cancel: () => void }).cancel = cancel;

// Handle escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (currentData?.showCancel !== false) {
      cancel();
    }
  }
  // Enter key confirms
  if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
    confirm();
  }
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
