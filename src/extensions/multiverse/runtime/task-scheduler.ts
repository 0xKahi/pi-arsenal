/** One settled outcome per input task, always returned in input order. */
export type SettledTask<Result> = { status: 'fulfilled'; value: Result } | { status: 'rejected'; error: string } | { status: 'aborted' };

/**
 * Runs every task through one shared capacity pool and waits for all of them to settle.
 * Failures are isolated, queued tasks are never started after an abort, and the caller
 * always receives exactly one entry per input in the original order.
 */
export async function runWithGlobalConcurrency<Param, Result>(
  tasks: readonly Param[],
  maxConcurrency: number,
  runner: (task: Param, index: number) => Promise<Result> | Result,
  signal?: AbortSignal,
): Promise<Array<SettledTask<Result>>> {
  const results = new Array<SettledTask<Result>>(tasks.length);
  if (tasks.length === 0) return results;

  const capacity = Math.max(1, Math.min(Math.floor(maxConcurrency) || 1, tasks.length));
  // Read the current state first: a signal aborted before dispatch never emits an event.
  let aborted = signal?.aborted === true;
  const onAbort = () => {
    aborted = true;
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) return;
      if (aborted) {
        results[index] = { status: 'aborted' };
        continue;
      }
      try {
        results[index] = { status: 'fulfilled', value: await runner(tasks[index] as Param, index) };
      } catch (error) {
        results[index] = { status: 'rejected', error: formatError(error) };
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: capacity }, worker));
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  return results;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
