# Registry Endpoint Configuration

The approved v4.1.1 architecture will make the whole Discover Registry use one validated endpoint descriptor; this is a target state and is not implemented until its Roadmap items are delivered.

## Current Owner

Main remains the single Registry network, cache, detail, and install owner.

Today [[src/main/registry.ts#fetchRegistry]], [[src/main/registry.ts#fetchModelRegistry]], and [[src/main/registry.ts#installRegistryItem]] share GitHub-specific module constants. Renderer consumers use the existing Registry IPC and do not own endpoint selection.

## Approved Target

One complete descriptor will atomically identify catalog, models, content, tree, web, and optional icon endpoints.

The selected source order is packaged build descriptor, then an explicit Main-only runtime descriptor, then the public default. A present but invalid source fails closed; fields are never merged across sources, and all caches are scoped to the descriptor identity.

## Ownership Boundary

Registry configuration extends the existing Main Registry owner and does not extend the managed Hermes runtime descriptor.

The runtime descriptor documented by [[runtime-connection#Runtime Descriptor]] continues to own Hermes home, CLI, and Gateway discovery only. Renderer never reads descriptor files or supplies URLs, and this architecture adds no Registry configuration IPC.

## Delivery Boundary

Runtime descriptor consumption and enterprise packaging are separate governed stages.

RM-01 owns the descriptor contract, source resolution, fail-closed behavior, unified Registry consumption, and cache identity. RM-02 later owns enterprise build-profile generation and final package proof; neither stage changes Hermes Agent/CLI, Registry governance, authentication, or Skill Run contracts.
