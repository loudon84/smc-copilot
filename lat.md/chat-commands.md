# Chat Commands

Slash-command handling for Copilot Chat: local desktop catalog via Ports, with optional Gateway-backed execution when adapters wire it.

Composer integration: [[src/renderer/src/modules/chat/components/composer/CopilotChatInput.tsx]].

## Slash command execution

Users type `/command args` in chat. Desktop lists/filters local commands; execution goes through `ChatCommandPort` so Chat Core never calls `window.*` directly.

### Command Port

[[src/renderer/src/modules/chat/ports/ChatCommandPort.ts#ChatCommandPort]] defines `listCommands` / `execute`. AI-OS adapter binds desktop slash catalog and optional execute handlers.

### Desktop slash catalog

[[src/renderer/src/modules/chat/components/composer/slashCommands.ts]] exports the built-in slash name/description list used by the Composer palette and `aiosCommandVoiceAdapter`.

### Local vs gateway commands

Desktop-only actions stay in adapters. Gateway `slash.exec` belongs outside Chat Core Ports until a Command adapter explicitly bridges it — do not reintroduce `modules/chat/source` slash routers.
