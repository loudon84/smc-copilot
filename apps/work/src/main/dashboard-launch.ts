export function dashboardCliArgs(
  profile: string | undefined,
  command: string[],
): string[] {
  return profile ? ["--profile", profile, ...command] : command;
}

export interface LocalDashboardCliOptions {
  skipBuild?: boolean;
}

export function buildLocalDashboardCliArgs(
  profile: string | undefined,
  port: number,
  options: LocalDashboardCliOptions = {},
): string[] {
  // Upstream dropped `--isolated` from `hermes dashboard`; passing it exits 2
  // ("unrecognized arguments") and the gateway never becomes ready.
  const args = dashboardCliArgs(profile, [
    "dashboard",
    "--no-open",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ]);

  if (options.skipBuild) {
    args.push("--skip-build");
  }

  return args;
}
