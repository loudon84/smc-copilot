/**
 * Legacy local Gateway spawn. Forbidden when control_owner=salt.
 */
export {
  startGateway,
  startGatewayDetailed,
  stopGateway,
  restartGateway,
  startGatewayWithRecovery,
  isGatewayRunning,
} from "../../hermes";
