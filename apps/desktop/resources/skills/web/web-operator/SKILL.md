# Web Operator Skill

## Overview

This skill enables Hermes to operate external web pages through the Portal Desktop Web Operator. All browser actions are executed in the Electron Main Process via the local Tool Bridge server.

## Tool Bridge Address

```
http://127.0.0.1:8765
```

## Available Tools

### browser.open
Open an allowed external web page.
- Parameters: `url` (string, required)

### browser.get_state
Get current page title, URL, text content, inputs, buttons, and links.
- Parameters: none

### browser.screenshot
Capture a screenshot of the current page.
- Parameters: none

### browser.click
Click a page element by CSS selector.
- Parameters: `selector` (string, required)

### browser.type
Type text into an input or textarea by CSS selector.
- Parameters: `selector` (string, required), `text` (string, required)

### browser.back
Navigate back in browser history.
- Parameters: none

### browser.forward
Navigate forward in browser history.
- Parameters: none

### browser.reload
Reload the current page.
- Parameters: none

### browser.extract_table
Extract table data by CSS selector.
- Parameters: `selector` (string, required)

## Operation Rules

1. **Always call `browser.get_state` before `click`, `type`, or `extract_table`** to understand the current page structure.
2. **Never execute `browser.type` on `input[type=password]` fields** — password field typing is blocked by security.
3. **Sensitive actions require user confirmation** — actions involving submit, approve, reject, delete, remove, payment, transfer, archive, publish, or send will be held pending until the user confirms or rejects.
4. **Prefer stable selectors** in this order: `id` > `name` > `aria-label` > `role` > CSS class.
5. **Report your action plan before execution** when operating on ERP, CRM, or OA pages — describe what you intend to do, then wait for acknowledgment.

## Error Codes

| Code | Meaning |
|------|---------|
| EXTERNAL_WEB_VIEW_NOT_READY | WebContentsView is not created or destroyed |
| DOMAIN_NOT_ALLOWED | The requested domain is not in the allowlist |
| SELECTOR_NOT_FOUND | No element matches the given CSS selector |
| PASSWORD_FIELD_BLOCKED | Typing into password fields is blocked |
| UNSAFE_ACTION_REQUIRES_CONFIRMATION | Sensitive action requires user confirmation |
| JAVASCRIPT_EXECUTION_FAILED | JavaScript injection failed in the page |
| SCREENSHOT_FAILED | Screenshot capture failed |

## Security Notes

- The Tool Server listens only on `127.0.0.1` — no LAN exposure.
- Cookies, localStorage, sessionStorage, and auth headers are never returned.
- All operations are logged to an append-only JSONL audit file.
