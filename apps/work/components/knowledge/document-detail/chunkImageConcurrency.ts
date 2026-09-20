/**
 * Module-level image IPC semaphore — max 3 in-flight getFileChunkImage calls.
 */

type QueueEntry = {
  run: () => Promise<void>;
};

const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const queue: QueueEntry[] = [];

function pump(): void {
  while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
    const next = queue.shift();
    if (!next) return;
    inFlight += 1;
    void next.run().finally(() => {
      inFlight -= 1;
      pump();
    });
  }
}

export async function withChunkImageConcurrency<T>(
  task: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: async () => {
        try {
          resolve(await task());
        } catch (error) {
          reject(error);
        }
      },
    });
    pump();
  });
}

/** Test / diagnostics only. */
export function chunkImageConcurrencyStats(): {
  inFlight: number;
  queued: number;
} {
  return { inFlight, queued: queue.length };
}

export function resetChunkImageConcurrencyForTests(): void {
  inFlight = 0;
  queue.length = 0;
}
