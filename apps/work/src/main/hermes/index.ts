/**
 * Hermes client surface for apps/work (PRD v2.0 split).
 * Transport = data plane; availability = Connection Ready; legacy-process = runtime owner only.
 */
export {
  getHermesControlOwner,
  isSaltControlOwner,
  isOpsiControlOwner,
  isExternallyManagedControlOwner,
  isRuntimeControlOwner,
  isDirectControlOwner,
  readControlOwnerSnapshot,
  saltManagedMessage,
  externallyManagedMessage,
} from "./control-owner";
export { HermesAvailabilityBackend } from "./availability-backend";
export {
  getApiUrl,
  isGatewayHealthy,
  isRemoteMode,
} from "./transport/gateway-http";
export {
  startGateway,
  stopGateway,
  restartGateway,
  isGatewayRunning,
} from "./legacy-process/gateway-process";
