# Registry Endpoint Configuration

The Discover Registry resolves one validated endpoint descriptor in Main so catalog, models, content, tree, homepage, and optional icons retain one source identity.

## Current Owner

Main remains the single Registry network, cache, detail, and install owner.

[[src/main/registry.ts#fetchRegistry]], [[src/main/registry.ts#fetchModelRegistry]], [[src/main/registry.ts#fetchRegistryDetail]], and [[src/main/registry.ts#installRegistryItem]] resolve and consume the same descriptor. Renderer consumers retain the existing Registry IPC and never own endpoint selection.

## Descriptor and Source Resolution

One complete descriptor atomically identifies catalog, models, content, tree, web, and optional icon endpoints.

The selected source order is packaged `work-registry-config.json`, then the explicit Main-only `HERMES_SKILL_REGISTRY_CONFIG_FILE`, then the public default. A present but invalid source returns `SKILL_REGISTRY_CONFIG_INVALID` before any Registry request; fields are never merged across sources, and `HERMES_SKILL_REGISTRY_URL` is ignored.

## Transport, Errors, and Cache

Descriptor endpoints are validated before use and content paths cannot escape `contentBaseUrl`.

Catalog, model, detail, tree, and download flows derive their URLs from the selected descriptor. Main does not forward `GITHUB_TOKEN`/`GH_TOKEN` or provider-specific request headers. Unavailable selected endpoints return sanitized `SKILL_REGISTRY_UNAVAILABLE` errors, and catalog/model/tree caches are bound to descriptor identity; [[src/main/registry.ts#__resetRegistryForTests]] clears the resolution and all three caches together for deterministic tests.

## Ownership Boundary

Registry configuration extends the existing Main Registry owner and does not extend the managed Hermes runtime descriptor.

The runtime descriptor documented by [[runtime-connection#Runtime Descriptor]] continues to own Hermes home, CLI, and Gateway discovery only. Renderer never reads descriptor files or supplies URLs, and this architecture adds no Registry configuration IPC.

## Delivery Boundary

Runtime descriptor consumption and enterprise packaging are separate governed stages.

RM-01 implements descriptor consumption, source resolution, fail-closed behavior, unified Registry consumption, and cache identity. RM-02 still owns enterprise build-profile generation and final package proof; neither stage changes Hermes Agent/CLI, Registry governance, authentication, or Skill Run contracts.
