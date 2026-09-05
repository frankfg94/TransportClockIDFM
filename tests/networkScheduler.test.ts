import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetworkScheduler } from "../src/services/networkScheduler";
import { resolveUnlimitedNetwork } from "../config/networkPolicy";

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe("nearby network scheduler", () => {
  it("changes concurrency without cancelling active work and drains FIFO when raised", async () => {
    const run = createNetworkScheduler(2);
    const bodies = Array.from({ length: 5 }, deferred);
    const started: number[] = [];
    const requests = bodies.map((body, i) => run(async () => {
      started.push(i);
      await body.promise;
    }));
    await flush();
    run.setConcurrency(1);
    bodies[0]!.resolve();
    await flush();
    expect(started).toEqual([0, 1]);
    bodies[1]!.resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);
    run.setConcurrency(Infinity);
    await flush();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    bodies.forEach((body) => body.resolve());
    await Promise.all(requests);
  });

  it("shares four slots and starts queued work FIFO after the whole task completes", async () => {
    const run = createNetworkScheduler();
    const bodies = Array.from({ length: 6 }, deferred);
    const started: number[] = [];
    const requests = bodies.map((body, i) =>
      run(async () => {
        started.push(i);
        await body.promise;
        return i;
      }),
    );
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);
    bodies[1]!.resolve();
    await flush();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    bodies[0]!.resolve();
    await flush();
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    bodies.forEach((body) => body.resolve());
    expect(await Promise.all(requests)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("removes cancelled queued work and releases a slot after failure", async () => {
    const run = createNetworkScheduler(1);
    const gate = deferred();
    const first = run(async () => {
      await gate.promise;
      throw new Error("upstream");
    });
    const firstError = expect(first).rejects.toThrow("upstream");
    const controller = new AbortController();
    const cancelledTask = vi.fn();
    const cancelled = run(cancelledTask, controller.signal);
    const cancelledError = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    const last = run(async () => "ok");
    controller.abort();
    gate.resolve();
    await Promise.all([firstError, cancelledError]);
    expect(await last).toBe("ok");
    expect(cancelledTask).not.toHaveBeenCalled();
  });

  it("times out active work, aborts its fetch and starts the next task with a fresh deadline", async () => {
    vi.useFakeTimers();
    const run = createNetworkScheduler(1, 100);
    let activeSignal: AbortSignal | undefined;
    const first = run(async (signal) => {
      activeSignal = signal;
      await new Promise(() => {});
    });
    const failure = expect(first).rejects.toMatchObject({ name: "TimeoutError" });
    const next = run(async () => "next");
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    expect(activeSignal?.aborted).toBe(true);
    expect(await next).toBe("next");
  });

  it("supports unlimited concurrency while retaining active cancellation", async () => {
    const run = createNetworkScheduler(Infinity);
    const controller = new AbortController();
    const tasks = Array.from({ length: 8 }, () =>
      vi.fn(async () => {
        await new Promise(() => {});
      }),
    );
    const requests = tasks.map((task) => run(task, controller.signal));
    const results = Promise.allSettled(requests);
    await flush();
    expect(tasks.every((task) => task.mock.calls.length === 1)).toBe(true);
    controller.abort();
    expect((await results).every((result) => result.status === "rejected")).toBe(true);
  });

  it("defaults to unlimited only in dev and honors explicit overrides", () => {
    expect(resolveUnlimitedNetwork(undefined, true)).toBe(true);
    expect(resolveUnlimitedNetwork(undefined, false)).toBe(false);
    expect(resolveUnlimitedNetwork("false", true)).toBe(false);
    expect(resolveUnlimitedNetwork(" TRUE ", false)).toBe(true);
    expect(resolveUnlimitedNetwork("invalid", false)).toBe(false);
  });
});
