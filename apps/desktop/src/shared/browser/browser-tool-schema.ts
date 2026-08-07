export interface BrowserToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export const browserToolSchemas: BrowserToolSchema[] = [
  {
    name: "browser.open",
    description: "Open an allowed external web page in Portal Desktop.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to open" }
      },
      required: ["url"]
    }
  },
  {
    name: "browser.get_state",
    description: "Get current page title, url, text, inputs, buttons and links.",
    input_schema: { type: "object" }
  },
  {
    name: "browser.screenshot",
    description: "Capture screenshot of current page.",
    input_schema: { type: "object" }
  },
  {
    name: "browser.click",
    description: "Click page element by CSS selector.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the element to click" }
      },
      required: ["selector"]
    }
  },
  {
    name: "browser.type",
    description: "Type text into input or textarea by CSS selector.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the target element" },
        text: { type: "string", description: "Text to type" }
      },
      required: ["selector", "text"]
    }
  },
  {
    name: "browser.back",
    description: "Navigate back in browser history.",
    input_schema: { type: "object" }
  },
  {
    name: "browser.forward",
    description: "Navigate forward in browser history.",
    input_schema: { type: "object" }
  },
  {
    name: "browser.reload",
    description: "Reload the current page.",
    input_schema: { type: "object" }
  },
  {
    name: "browser.extract_table",
    description: "Extract table data by CSS selector.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the table element" }
      },
      required: ["selector"]
    }
  },
  {
    name: "crm.get_context",
    description: "Get the most recent CRM bridge event from the current WebOperator page.",
    input_schema: { type: "object" }
  },
  {
    name: "crm.click_button",
    description: "Click a CRM page button by actionKey or selector fallback.",
    input_schema: {
      type: "object",
      properties: {
        actionKey: { type: "string", description: "Registered CRM action key" },
        selector: { type: "string", description: "CSS selector fallback" },
        entityId: { type: "string", description: "Optional entity id" },
        payload: { type: "object", description: "Optional payload" }
      }
    }
  },
  {
    name: "crm.run_action",
    description: "Run a registered CRM action handler by actionKey.",
    input_schema: {
      type: "object",
      properties: {
        actionKey: { type: "string", description: "Registered CRM action key" },
        entityId: { type: "string", description: "Optional entity id" },
        payload: { type: "object", description: "Optional payload" }
      },
      required: ["actionKey"]
    }
  },
  {
    name: "crm.push_json",
    description: "Push JSON handoff data to the current CRM page.",
    input_schema: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Handoff schema name" },
        entityType: { type: "string", description: "Optional entity type" },
        entityId: { type: "string", description: "Optional entity id" },
        handoffId: { type: "string", description: "Optional handoff id" },
        data: { type: "object", description: "JSON payload" }
      },
      required: ["schema", "data"]
    }
  },
  {
    name: "crm.open_form_with_json",
    description: "Navigate to CRM URL, deliver JSON on page ready, and open a form via actionKey.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target CRM page URL" },
        actionKey: { type: "string", description: "CRM action to open form" },
        schema: { type: "string", description: "Handoff schema name" },
        entityType: { type: "string", description: "Optional entity type" },
        entityId: { type: "string", description: "Optional entity id" },
        data: { type: "object", description: "JSON payload for form fill" },
        ttlMs: { type: "number", description: "Handoff TTL in milliseconds" }
      },
      required: ["url", "actionKey", "schema", "data"]
    }
  }
];
