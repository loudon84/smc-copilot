let generation = 0;
let latestReason = "";
let tail: Promise<void> = Promise.resolve();

export function beginRuntimeIntent(reason: string): number {
  generation += 1;
  latestReason = reason;
  return generation;
}

export function currentRuntimeGeneration(): number {
  return generation;
}

export function runtimeIntentCurrent(generationId: number): boolean {
  return generationId === generation;
}

export function currentRuntimeReason(): string {
  return latestReason;
}

export function logoutIntentIsWaiting(): boolean {
  return latestReason === "logout";
}

export function enqueueRuntimeMutation<T>(
  generationId: number,
  work: () => Promise<T>,
): Promise<T | { superseded: true }> {
  const run = tail.then(async () => {
    if (!runtimeIntentCurrent(generationId)) return { superseded: true as const };
    return work();
  });
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
