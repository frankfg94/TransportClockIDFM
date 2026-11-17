import type { NeighborhoodJourneysRequest } from "../../features/nearby-stations/neighborhoodJourneys";

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

/** Independent lanes keep a night-time tree from waiting for daytime egress.
 * These limits bound work, not the returned routes or the two shared trees. */
export function createNeighborhoodGtfsSchedulingQueues() {
  const transport = createNeighborhoodGtfsTaskQueue(3);
  // Large-station and job-hub probes share the origin tree with heavy
  // access but can publish before its destination-specific walking batches.
  const benchmarks = createNeighborhoodGtfsTaskQueue();
  const night = createNeighborhoodGtfsTaskQueue();
  const places = createNeighborhoodGtfsTaskQueue();
  const timetable = createNeighborhoodGtfsTaskQueue();
  const all = [transport, benchmarks, night, places, timetable];
  return {
    select(kind: "routes" | "frequency" | "last-service" | "night-access", purpose?: NeighborhoodJourneysRequest["purpose"]) {
      if (kind === "night-access") return night;
      if (kind !== "routes") return timetable;
      if (purpose === "night-transport") return night;
      if (purpose === "places") return places;
      if (purpose === "transport-benchmark") return benchmarks;
      return transport;
    },
    cancel(id: number) { for (const queue of all) queue.cancel(id); },
    idle() { return Promise.all(all.map(queue => queue.idle())); },
  };
}
