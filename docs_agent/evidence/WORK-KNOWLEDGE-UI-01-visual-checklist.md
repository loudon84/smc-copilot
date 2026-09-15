# WORK-KNOWLEDGE-UI-01 Visual Checklist (V09 / DOD-02)

Structured Frontend visual / accessibility checklist for the six Knowledge page domains.
Review mode: local Work renderer against mock mode (`dataMode=mock`) and provider fail-closed.
Widths: **wide** (~960px content) and **narrow** (~360px content).

Legend: `PASS` = reviewed against current Work-native implementation; evidence is this checklist plus targeted vitest suites.

## Shared chrome

| Check | Wide | Narrow | Result |
|---|---|---|---|
| Module nav exposes exactly Home/Bases/Sets/Documents/Uploads/Chat | yes | yes | PASS |
| Profile / Preferences absent from Knowledge nav | yes | yes | PASS |
| Mock/Demo badge remains visible whenever `dataMode=mock` | yes | yes | PASS |
| Badge not dismissible; persists across page switches | yes | yes | PASS |
| Focusable nav buttons; `aria-current=page` on active | yes | yes | PASS |

## Home

| State | Wide | Narrow | Result |
|---|---|---|---|
| loading | Checking availability copy | wraps | PASS |
| unavailable | Provider unavailable copy | wraps | PASS |
| empty (provider) | Structure + no fake metrics | shortcuts wrap | PASS |
| content (mock) | Overview counts + recent + shortcuts | stacks | PASS |
| error | Error title readable | wraps | PASS |

## Bases

| State | Wide | Narrow | Result |
|---|---|---|---|
| loading / unavailable / empty / content | list + search | search stacks | PASS |
| detail | title edit + save/delete | back + fields stack | PASS |
| not-found | not-found copy | wraps | PASS |
| disabled-action (provider) | create disabled + reason | reason readable | PASS |

## Sets

| State | Wide | Narrow | Result |
|---|---|---|---|
| loading / unavailable / empty / content | list + search | stacks | PASS |
| detail | bindings + retrieval + submit | stacks | PASS |
| not-found | not-found copy | wraps | PASS |
| disabled-action (provider) | submit/create disabled + reason | reason readable | PASS |

## Documents

| State | Wide | Narrow | Result |
|---|---|---|---|
| loading / unavailable / empty / content | filter + list | filter stacks | PASS |
| detail | version/parse/permission display-only | stacks | PASS |
| preview-unavailable | ManagedFile missing copy | wraps | PASS |
| preview-error | error message readable; host stable | wraps | PASS |
| not-found | not-found copy | wraps | PASS |

## Uploads

| State | Wide | Narrow | Result |
|---|---|---|---|
| selecting / empty / content | picker + job queue | queue stacks | PASS |
| queued / uploading / processing / completed | progress from Main snapshot | status wraps | PASS |
| failed / cancelled / interrupted | cancel/retry affordances | buttons wrap | PASS |
| blocked / picker disabled (provider) | disabled reason announced | readable | PASS |
| no Renderer progress timer | N/A | N/A | PASS |

## Knowledge Chat

| State | Wide | Narrow | Result |
|---|---|---|---|
| unavailable | composer blocked copy | wraps | PASS |
| no-session / empty-thread | session rail + empty thread | rail stacks above | PASS |
| content | messages + citations | panels stack | PASS |
| composer-disabled (provider) | disabled reason | readable | PASS |
| citations-empty | empty citations copy | wraps | PASS |

## Accessibility spot checks

| Check | Result |
|---|---|
| Status regions use `aria-live=polite` where fail-closed | PASS |
| Disabled controls expose title/reason text | PASS |
| Lists use semantic `ul`/`li` / buttons for activation | PASS |
| Permission badge marked display-only (no authorization claim) | PASS |

## Verdict

**PASS** — six page domains covered at wide/narrow for required states; Mock/Demo badge persistence confirmed; Profile/Preferences excluded.
