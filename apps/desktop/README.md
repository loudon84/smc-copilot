[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/loudon84/ai-os-desktop)
# SMC Copilot (`smc-ai-copilot`)

**SMC Copilot** is an Electron-based **Portal Desktop** shell for [Hermes Agent](https://github.com/loudon84/ai-os-hermes). The repository codebase evolved from **hermes-desktop** (install/configure/chat for a single Hermes runtime) into a multi-profile copilot console with cross-profile orchestration and embedded web automation.

| | |
|---|---|
| **Product name** | SMC Copilot |
| **Package / executable** | `smc-ai-copilot` |
| **appId** | `com.smc.smc-ai-copilot` |
| **Stack** | Electron 39 · React 19 · TypeScript · Tailwind CSS 4 |
| **Agent docs** | [AGENTS.md](./AGENTS.md) · [docs/INDEX.md](./docs/INDEX.md) |

> **Active development.** APIs, screens, and install flows may change. For architecture and IPC contracts, see [AGENTS.md](./AGENTS.md) and [docs/API_CONTRACTS.md](./docs/API_CONTRACTS.md).

## Languages

- English: `README.md` (this file)
- 简体中文: [README.zh-CN.md](./README.zh-CN.md)

---

## What this project is today

SMC Copilot is **not only** a Hermes Agent installer GUI. It is a desktop **control plane + workspace** that:

1. **Deploys and operates** Hermes Agent (local install, enterprise pipeline, PyPI mirror, runtime bundle).
2. **Runs multiple Profile Gateways** in parallel (default + specialist roles on ports 8642–8648).
3. **Exposes dedicated entry points** per profile (Portal Workspace, Profile Workspaces, Runtime panel).
4. **Coordinates work across profiles** (delegation, skill sync, session context sharing).
5. **Embeds external web apps** via Electron **WebContentsView** (Web Operator) so users and agents share the same browser surface inside Portal.

Hermes Agent remains the execution engine (tools, memory, gateways, learning loop). SMC Copilot owns the **desktop shell**, **process lifecycle**, **SQLite control plane**, and **unified UI**.

---

## Evolution at a glance

| Phase | Focus | What changed |
|---|---|---|
| **V1.0 — hermes-desktop** | Single-runtime desktop | Guided install, provider setup, streaming chat, sessions, skills, memory, 16 messaging gateways, Claw3D Office |
| **V1.1 — Multi Profile Runtime** | Portal Desktop | 7 profiles × independent Gateway; `profile-runtime.db` control plane; Portal Workspace + specialist Profile Workspaces; profile entries & layouts |
| **V1.2 — Runtime stability** | Operations | Crash detection, auto-restart, port conflict checks, startup timeout, gateway logs, app restart reconciliation |
| **V1.2.1 — Enterprise Install** | One-click deploy | Deployment config + schema, runtime bundle (online/offline), 20-step preflight/install pipeline, Runtime Doctor, install lock/marker/log |
| **V1.4 / V1.4.1 — Desktop shell** | Product hardening | Custom title bar / window IPC, NSIS precheck, local zip / Git agent source, PyPI mirror presets, `agent-deps-installer`, rebranded as **SMC Copilot** |

---

## Core capabilities

### Foundation (from hermes-desktop)

- Guided first-run install and **local / remote** backend modes
- Streaming chat (SSE), tool progress, markdown, token/cost display
- Sessions (SQLite FTS), models, providers, memory, SOUL persona, skills, toolsets, cron schedules
- 16 messaging gateway platforms (Telegram, Discord, Slack, …)
- Hermes Office (Claw3D), backup/import, log viewer, auto-updater
- i18n: English, Spanish, Portuguese (Brazil), Chinese (Simplified)

### Multi Profile Runtime (V1.1+)

- **7 profiles**: `default`, `writer`, `coding`, `research`, `recruiters`, `finance`, `agenter`
- **Dedicated Gateway per profile** on `127.0.0.1:8642`–`8648`
- **Profile Runtime screen**: start/stop/restart, status, config import, gateway logs (V1.2)
- **SQLite control plane**: `~/.hermes/desktop/profile-runtime.db`

### Cross-profile orchestration

| Capability | Purpose |
|---|---|
| **Delegation** | Default profile invokes a specialist profile (`POST /v1/chat/completions`) with audit trail |
| **Skill sync** | Copy skills between profiles (skip / overwrite + backup, SHA-256 verify) |
| **Session context share** | Export session context as `context.md` (snapshot / summary / full) — does not merge `state.db` |

Preload APIs: `window.profileRuntime`, `window.profileEntry`.

### Portal workspaces & Web Operator

| Surface | Route | Role |
|---|---|---|
| **Portal Workspace** | `/aios-workspace` | Default-profile command center: chat, multi-profile status, delegation entry, Web Operator launch |
| **Profile Workspace** | `/profile-workspace/:profileId` | Specialist workspace (isolated chat, skills, context, audit) |
| **Profile Runtime** | `/profile-runtime` | Runtime ops & gateway logs |
| **Web Operator** | `/web-operator` | Three-pane UI: Hermes task panel · **WebContentsView** viewport · status/audit panel |

Web Operator (Main: `src/main/browser/`):

- **WebContentsView** with isolated partition `persist:aios-external-web`
- Domain allowlist, sensitive-action confirmation (`browser.click`, `browser.type`)
- JSONL audit log under `~/.hermes/desktop/web-operator/`
- Local tool server on `127.0.0.1` (8765–8775) for Hermes tool bridge

Preload API: `window.aiosBrowser`.

### Enterprise install & desktop shell (V1.2.1+)

- 20-step enterprise pipeline: preflight → bundle → agent → venv → profiles → marker
- Runtime Doctor (9 checks), install lock / marker / redacted logs
- Security: Gateway **127.0.0.1 only**, no HKLM / system PATH, secrets not written to marker or logs
- **V1.4.1**: local zip or Git agent source, PyPI mirror UI (Tsinghua / Aliyun / Tencent / official / custom), `desktop-runtime.json`, custom window controls

---

## Architecture (summary)

Strict **Main / Preload / Renderer** separation:

```
Renderer (React)
  → window.hermesAPI | profileRuntime | profileEntry | aiosBrowser
Preload (contextBridge)  →  src/preload/
Main (Node.js)           →  src/main/  (IPC, FS, SQLite, Gateway spawn)
Hermes Python Gateway    →  http://127.0.0.1:<port>/v1/chat/completions
```

New backend features must follow: **Main module → `ipcMain.handle` → Preload wrapper → `index.d.ts` → Renderer**. See [.cursor/rules/](./.cursor/rules/) and [AGENTS.md](./AGENTS.md).

---

## Application flow

**Lifecycle screens** (`App.tsx`):

```
splash → welcome → installing → setup → main (Layout)
```

**Main navigation** (high level):

| Area | Screens |
|---|---|
| **Copilot** | Chat, Sessions, Agents, Models, Providers, Skills, Soul, Memory, Tools, Schedules, Gateway, Settings |
| **Portal** | Portal Workspace, Profile Workspaces, Profile Runtime, Web Operator |
| **Visual** | Office (Claw3D) |

Chat path: Renderer → `hermesAPI.sendMessage` → Main `hermes.ts` → local SSE or CLI fallback (or remote HTTPS).

---

## Install (end users)

Download the latest build from your release channel (Windows NSIS: `smc-copilot-<version>-setup.exe`).

| Platform | Artifact |
|---|---|
| Windows | `.exe` (NSIS) |
| macOS | `.dmg` |
| Linux | `.AppImage`, `.deb`, `.rpm`, `.snap` |

> **Windows:** Installer may be unsigned; SmartScreen may prompt on first run.

### Typical directories

| Path | Contents |
|---|---|
| `%USERPROFILE%\.hermes\` | Agent config, `state.db`, profiles, desktop control plane |
| `%LOCALAPPDATA%\Programs\SMC Copilot\` (or `$INSTDIR`) | App binary, `runtime/`, `hermes-agent/`, `venv/`, logs |
| `~/.hermes/desktop/profile-runtime.db` | Multi-profile runtime state |
| `~/.hermes/desktop/web-operator/` | Web Operator config & audit logs |

---

## Development

### Prerequisites

- Node.js 18+ and npm
- Network access for Hermes / dependency install during first run (unless using offline bundle)

### Commands

```bash
npm install
npm run dev          # electron-vite dev
npm run build        # typecheck + production build
npm run typecheck
npm run test
npm run lint
```

Platform packages:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

### Project layout

| Directory | Role |
|---|---|
| `src/main/` | Main process — IPC, Gateway, enterprise install, browser/Web Operator |
| `src/preload/` | contextBridge APIs |
| `src/renderer/src/` | React UI (`screens/`, `components/`) |
| `src/shared/` | i18n, profile-runtime & enterprise contracts |
| `resources/profiles/` | Profile templates |
| `docs/` | Architecture, modules, API contracts |
| `tests/` | Vitest |

### Documentation map

| Doc | Use when |
|---|---|
| [AGENTS.md](./AGENTS.md) | Coding with Cursor / agents — quick reference |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Process model, Gateway, V1.x diagrams |
| [docs/MODULES.md](./docs/MODULES.md) | File-level module responsibilities |
| [docs/API_CONTRACTS.md](./docs/API_CONTRACTS.md) | IPC channel list |
| [docs/READING_GUIDE.md](./docs/READING_GUIDE.md) | Suggested code reading order |

---

## Tech stack

- **Electron** 39 + **electron-vite** 5
- **React** 19 + **Tailwind CSS** 4 + **lucide-react**
- **TypeScript** 5.9
- **better-sqlite3** — sessions + profile-runtime control plane
- **i18next** — 4 locales
- **Vitest** + Testing Library
- **electron-updater** — release updates

---

## Relationship to Hermes Agent

SMC Copilot is the **desktop host**. [Hermes Agent](https://github.com/NousResearch/hermes-agent) provides agent behavior, tools, memory, and gateway integrations. The desktop app installs and configures Hermes, spawns Gateway processes per profile, and surfaces operations through a unified Portal UI.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For large UI or IPC changes, align with `.cursor/rules/` and update `docs/API_CONTRACTS.md` when contracts change.

## License

MIT — see [LICENSE](./LICENSE).
