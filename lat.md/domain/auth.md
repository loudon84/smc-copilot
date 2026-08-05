# Auth and startup

Startup gates on Portal auth and local bootstrap before Hermes install/setup. Login uses Portal Auth HTTP, not the Hermes Gateway port.

Decision: [[decisions#Tokens stay in Main]]. Entry: [[src/main/startup/startup-decision.ts#resolveStartupDecision]].

## Startup gate

[[src/main/startup/startup-decision.ts#resolveStartupDecision]] is the Main authority for splash routing. Renderer reaches it via `window.smcShell.resolveStartupDecision()`.

Route order: splash → login → welcome → installing → setup → main. Local, remote, and SSH modes share the same auth + bootstrap gate. `bootstrap-pending` can auto-run bootstrap on LoginScreen after credentials succeed.

## Token vault and injection

Tokens stay in Main (`keytar` → `safeStorage` → memory); Renderer never sees raw access tokens. [[src/main/auth/token-header-injector.ts#installTokenHeaderInjector]] injects Bearer only for allowlisted Portal origins on `persist:aios-home`.

Do not inject into Gateway (`8642`) or Web Operator / external-browser partitions. Decision: [[decisions#Tokens stay in Main]].

## Local bootstrap default

After login, Desktop synthesizes a local bootstrap document (`local-v1`) and applies it unless `HERMES_USE_REMOTE_USER_CONFIG=true`. Apply refreshes Portal view preparation without covering the full main UI prematurely.
