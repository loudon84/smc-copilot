/**
 * Local dashboard web dist is not built or spawned by Work.
 * Remote/SSH dashboard ownership is unchanged.
 */
export function localDashboardWebDistDir(): string {
  return "";
}

export function hasLocalDashboardWebDist(): boolean {
  return false;
}

export async function ensureLocalDashboardWebDist(): Promise<boolean> {
  return false;
}
