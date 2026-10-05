export type NetworkConcurrencyMode = "auto" | "limited" | "unlimited";

// Also imported by the Node data compiler, where Vite does not inject the
// development-only constant. `typeof` keeps the runtime fallback safe there.
declare const __UNLIMITED_NETWORK__: boolean | undefined;

/** Client-side FIFO shared by nearby data requests, independent of hosting. */
export function createNetworkScheduler(concurrency = 4, timeoutMs = 45_000) {
  let active = 0;
  const queue: Array<() => void> = [];
  const activeSignals = new WeakSet<AbortSignal>();

  function drain(): void {
    while (active < concurrency && queue.length > 0) queue.shift()!();
  }

  function run<T>(
    task: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    // A source can call a provider which uses this same scheduler. Reuse its
    // slot and deadline rather than waiting behind ourselves in a second FIFO.
    if (signal && activeSignals.has(signal)) {
      return Promise.resolve().then(() => {
        signal.throwIfAborted();
        return task(signal);
      });
    }
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const cancelQueued = () => {
        const index = queue.indexOf(start);
        if (index >= 0) queue.splice(index, 1);
        reject(signal?.reason);
      };
      const start = () => {
        signal?.removeEventListener("abort", cancelQueued);
        active++;
        const controller = new AbortController();
        activeSignals.add(controller.signal);
        const cancel = () => controller.abort(signal?.reason);
        signal?.addEventListener("abort", cancel, { once: true });
        const timer = setTimeout(
          () => controller.abort(new DOMException("Network request timed out", "TimeoutError")),
          timeoutMs,
        );
        const aborted = new Promise<never>((_, fail) => {
          controller.signal.addEventListener("abort", () => fail(controller.signal.reason), {
            once: true,
          });
        });
        // Include response body consumption in task; a slow body keeps its slot.
        void Promise.race([
          Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return task(controller.signal);
          }),
          aborted,
        ])
          .then(resolve, reject)
          .finally(() => {
            clearTimeout(timer);
            activeSignals.delete(controller.signal);
            signal?.removeEventListener("abort", cancel);
            active--;
            drain();
          });
      };
      if (active < concurrency) start();
      else {
        queue.push(start);
        signal?.addEventListener("abort", cancelQueued, { once: true });
      }
    });
  }

  return Object.assign(run, {
    ownsSignal(signal: AbortSignal): boolean { return activeSignals.has(signal); },
    setConcurrency(value: number): void {
      concurrency = value;
      drain();
    },
  });
}

// Vite embeds only this non-secret boolean. Production and standalone tests
// default to bounded concurrency in every environment.
const environmentUnlimited = typeof __UNLIMITED_NETWORK__ !== "undefined" && __UNLIMITED_NETWORK__;
export const runNetworkTask = createNetworkScheduler(environmentUnlimited ? Infinity : 4);

export function setNetworkConcurrencyMode(mode: NetworkConcurrencyMode): void {
  const unlimited = mode === "auto" ? environmentUnlimited : mode === "unlimited";
  runNetworkTask.setConcurrency(unlimited ? Infinity : 4);
}
