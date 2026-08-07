import type { HermesNavItemDefinition } from "../../model/page";

export function isNavItemAccessible(
  item: HermesNavItemDefinition,
  gatewayOnline: boolean,
): boolean {
  if (item.visible === false) return false;
  if (item.requiresGateway && !gatewayOnline) return false;
  return true;
}
