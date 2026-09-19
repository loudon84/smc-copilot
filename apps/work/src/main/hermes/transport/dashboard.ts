/**
 * Local / remote dashboard transport (Chat WS). Not Salt control plane.
 */
export {
  getDashboardStatus,
  freshDashboardWebSocketUrl,
  startDashboard,
  attachLocalDashboardForKnowledge,
  stopDashboard,
  stopAllDashboards,
} from "../../dashboard";
