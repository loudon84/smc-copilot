import * as net from "net";

export function isPortAvailable(port: number, host: string = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function findAvailablePort(preferred: number, host: string = "127.0.0.1", maxAttempts: number = 10): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = preferred + offset;
    if (await isPortAvailable(port, host)) return port;
  }
  throw new Error(`No available port found starting from ${preferred} (tried ${maxAttempts})`);
}

export async function checkPortConflicts(ports: number[]): Promise<Array<{ port: number; available: boolean }>> {
  const results = await Promise.all(
    ports.map(async (port) => ({
      port,
      available: await isPortAvailable(port),
    })),
  );
  return results;
}
