%% lat:begin %%
# Before starting work

> **Monorepo location:** `services/runtime/` inside `smc-copilot`.
> Root routing: ../../AGENTS.md. Prefer `lat search` before reading large trees.
> API changes must regenerate contracts via `npm run contracts:generate` from repo root.

- Run `lat search` to find sections relevant to your task. Read them to understand the design intent before writing code.
- Run `lat expand` on user prompts to expand any `[[refs]]` — this resolves section names to file locations and provides context.

# Post-task checklist (REQUIRED — do not skip)

After EVERY task, before responding to the user:

- [ ] Update `lat.md/` if you added or changed any functionality, architecture, tests, or behavior
- [ ] Run `lat check` — all wiki links and code refs must pass
- [ ] Do not skip these steps. Do not consider your task done until both are complete.

---

# What is lat.md?

This project uses [lat.md](https://www.npmjs.com/package/lat.md) to maintain a structured knowledge graph of its architecture, design decisions, and test specs in the `lat.md/` directory. It is a set of cross-linked markdown files that describe **what** this project does and **why** — the domain concepts, key design decisions, business logic, and test specifications. Use it to ground your work in the actual architecture rather than guessing.

# Commands

```bash
lat locate "Section Name"      # find a section by name (exact, fuzzy)
lat refs "file#Section"        # find what references a section
lat search "natural language"  # semantic search across all sections
lat expand "user prompt text"  # expand [[refs]] to resolved locations
lat check                      # validate all links and code refs
```

Run `lat --help` when in doubt about available commands or options.

If `lat search` fails because no API key is configured, explain to the user that semantic search requires a key provided via `LAT_LLM_KEY` (direct value), `LAT_LLM_KEY_FILE` (path to key file), or `LAT_LLM_KEY_HELPER` (command that prints the key). Supported key prefixes: `sk-...` (OpenAI) or `vck_...` (Vercel). If the user doesn't want to set it up, use `lat locate` for direct lookups instead.

# Syntax primer

- **Section ids**: `lat.md/path/to/file#Heading#SubHeading` — full form uses project-root-relative path (e.g. `lat.md/tests/search#RAG Replay Tests`). Short form uses bare file name when unique (e.g. `search#RAG Replay Tests`, `cli#search#Indexing`).
- **Wiki links**: `[[target]]` or `[[target|alias]]` — cross-references between sections. Can also reference source code: `[[src/foo.ts#myFunction]]`.
- **Source code links**: Wiki links in `lat.md/` files can reference functions, classes, constants, and methods in TypeScript/JavaScript/Python/Rust/Go/C files. Use the full path: `[[src/config.ts#getConfigDir]]`, `[[src/server.ts#App#listen]]` (class method), `[[lib/utils.py#parse_args]]`, `[[src/lib.rs#Greeter#greet]]` (Rust impl method), `[[src/app.go#Greeter#Greet]]` (Go method), `[[src/app.h#Greeter]]` (C struct). `lat check` validates these exist.
- **Code refs**: `// @lat: [[section-id]]` (JS/TS/Rust/Go/C) or `# @lat: [[section-id]]` (Python) — ties source code to concepts

# Test specs

Key tests can be described as sections in `lat.md/` files (e.g. `tests.md`). Add frontmatter to require that every leaf section is referenced by a `// @lat:` or `# @lat:` comment in test code:

```markdown
---
lat:
  require-code-mention: true
---
# Tests

Authentication and authorization test specifications.

## User login

Verify credential validation and error handling for the login endpoint.

### Rejects expired tokens
Tokens past their expiry timestamp are rejected with 401, even if otherwise valid.

### Handles missing password
Login request without a password field returns 400 with a descriptive error.
```

Every section MUST have a description — at least one sentence explaining what the test verifies and why. Empty sections with just a heading are not acceptable. (This is a specific case of the general leading paragraph rule below.)

Each test in code should reference its spec with exactly one comment placed next to the relevant test — not at the top of the file:

```python
# @lat: [[tests#User login#Rejects expired tokens]]
def test_rejects_expired_tokens():
    ...

# @lat: [[tests#User login#Handles missing password]]
def test_handles_missing_password():
    ...
```

Do not duplicate refs. One `@lat:` comment per spec section, placed at the test that covers it. `lat check` will flag any spec section not covered by a code reference, and any code reference pointing to a nonexistent section.

# Section structure

Every section in `lat.md/` **must** have a leading paragraph — at least one sentence immediately after the heading, before any child headings or other block content. The first paragraph must be ≤250 characters (excluding `[[wiki link]]` content). This paragraph serves as the section's overview and is used in search results, command output, and RAG context — keeping it concise guarantees the section's essence is always captured.

```markdown
# Good Section

Brief overview of what this section documents and why it matters.

More detail can go in subsequent paragraphs, code blocks, or lists.

## Child heading

Details about this child topic.
```

```markdown
# Bad Section

## Child heading

Details about this child topic.
```

The second example is invalid because `Bad Section` has no leading paragraph. `lat check` validates this rule and reports errors for missing or overly long leading paragraphs.
%% lat:end %%

## Work Task Runtime (v1.3)

- **SOT**: `WorkTask` + durable `task_execution_queue`; legacy `LocalTask` retained at `/api/v1/tasks`.
- **Kernel**: [[runtime/execution/kernel.py#AgentExecutionKernel]] — sole Hermes execution facade for task runs.
- **Guards**: `npm run guard` in `services/runtime/` (no direct Hermes in `runtime/tasks/`, state machine, contract drift).
- **E2E**: `tests/test_v13_task_runtime_e2e.py`
- **Docs**: `docs/architecture/work-task-runtime.md`

## v1.4.1 Hotfix notes

- Dev registration: `scripts/dev_bootstrap.py` → `DevHermesRegistrationService` + `InstanceService.ensure_default`.
- Logging: `configure_logging(settings)` dual sink under `<RUNTIME_DATA_DIR>/logs`.
- Gateway foreign port conflict → `gateway_port_conflict`, never kill unknown PID.
- ADRs: `docs/adr/ADR-011` … `ADR-014`.

## Hermes Supervisor hard rules (PRD v1.5 / v1.5.1)

- Runtime is the exclusive owner of Hermes Gateway processes.
- Never treat a listening port or `/health=200` as proof of process ownership.
- Never kill a process without ownership verification (PID + create_time + port + exe).
- Gateway authentication failure is not Gateway health (`GatewayHealthResult`).
- Instance DB `status`/`healthy` are compatibility projections, not observed runtime state.
- Health must be maintained by Runtime `GatewayHealthWorker`, not by Desktop refresh actions.
- Default Chat readiness resolves `HermesInstance.name == "default"` — never `limit(1)`.
- `executionEligible` requires Gateway healthy **and** ownership in `{owned, adopted}`.
- Development reload must preserve Gateways (`gateway_preserve_on_dev_shutdown`) and re-adopt via persistent fingerprint / Safe Adoption.
- ADRs: `docs/adr/ADR-015` … `ADR-020`.
