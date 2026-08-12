/**
 * HTTP transport to Hermes Gateway. Chat stays on this plane; Salt does not proxy it.
 */
export {
  getApiUrl,
  isGatewayHealthy,
  isRemoteMode,
} from "../../hermes";
