/** Bound concurrent datasets without blocking every caller behind an HTTP
 * walking wait. The timetable worker keeps the default single slot.
 * Cancellation never interrupts a routing tree shared by other subscribers. */
export function createNeighborhoodGtfsTaskQueue(concurrency = 1) {
  const limit = Math.max(1, Math.floor(concurrency) || 1);
  let active = 0, scheduled = false;
  const tasks = new Map<number, { cancelled: boolean }>();
  const waiting: { id: number; task: { cancelled: boolean }; run: (isCancelled: () => boolean) => Promise<void> }[] = [];
  const idleWaiters: (() => void)[] = [];
  function drain(): void {
    scheduled = false;
    while (active < limit && waiting.length) {
      const { id, task, run } = waiting.shift()!;
      if (task.cancelled) { if (tasks.get(id) === task) tasks.delete(id); continue; }
      active++;
      void (async () => { await run(() => task.cancelled); })().catch(() => {}).finally(() => {
        if (tasks.get(id) === task) tasks.delete(id);
        active--; schedule();
      });
    }
    if (!active && !waiting.length) for (const resolve of idleWaiters.splice(0)) resolve();
  }
  function schedule(): void {
    if (!scheduled) { scheduled = true; void Promise.resolve().then(drain); }
  }
  return {
    enqueue(id: number, run: (isCancelled: () => boolean) => Promise<void>) {
      const task = { cancelled: false };
      tasks.set(id, task);
      waiting.push({ id, task, run }); schedule();
    },
    cancel(id: number) { const task = tasks.get(id); if (task) task.cancelled = true; },
    idle() { return !active && !waiting.length ? Promise.resolve() : new Promise<void>(resolve => idleWaiters.push(resolve)); },
  };
}
