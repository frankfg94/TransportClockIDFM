/** Serialize retained datasets, while skipping work whose caller has left.
 * Cancellation of an active task suppresses its reply; subsequent queued
 * tasks can be removed without interrupting a shared routing tree. */
export function createNeighborhoodGtfsTaskQueue() {
  let queue = Promise.resolve();
  const tasks = new Map<number, { cancelled: boolean }>();
  return {
    enqueue(id: number, run: (isCancelled: () => boolean) => Promise<void>) {
      const task = { cancelled: false };
      tasks.set(id, task);
      queue = queue.then(async () => {
        try { if (!task.cancelled) await run(() => task.cancelled); }
        finally { if (tasks.get(id) === task) tasks.delete(id); }
      }).catch(() => {});
    },
    cancel(id: number) { const task = tasks.get(id); if (task) task.cancelled = true; },
    idle() { return queue; },
  };
}
