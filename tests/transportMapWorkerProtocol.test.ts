import { describe, expect, it } from "vitest";
import {
  createWorkerRequest,
  isCurrentGeneration,
  transferableBuffers,
  type TransportMapWorkerRequest,
} from "../src/features/transport-map/workers/protocol";
import { TransportMapWorkerPool } from "../src/features/transport-map/workers/workerPool";
import { createTransportMapPerformanceTrace } from "../src/features/transport-map/performance/transportMapPerformanceTrace";

describe("transport map Worker protocol", () => {
  it("keeps schema, generation and transferable buffers explicit", () => {
    const payload = { values: new Float32Array([1, 2, 3]), nested: [new Uint16Array([4])] };
    const request = createWorkerRequest("identity", payload, 7, "visible");
    expect(request.schemaVersion).toBe(1);
    expect(request.generation).toBe(7);
    expect(request.priority).toBe("visible");
    expect(isCurrentGeneration({ generation: 7 }, 7)).toBe(true);
    expect(isCurrentGeneration({ generation: 6 }, 7)).toBe(false);
    expect(transferableBuffers(payload)).toHaveLength(2);
    expect(transferableBuffers(payload)[0]).toBe(payload.values.buffer);
    expect(transferableBuffers(payload)[1]).toBe(payload.nested[0]!.buffer);
  });

  it("keeps the remaining worker task types explicit at the protocol boundary", () => {
    const request = createWorkerRequest("decode-chunk", { raw: "{}" }, 1);
    expect(request.taskType).toBe("decode-chunk");
  });

  it("falls back to the main thread after a Worker error and retires the bad Worker", async () => {
    const worker = new FailingWorker();
    const pool = new TransportMapWorkerPool({ size: 1, workerFactory: () => worker as unknown as Worker });
    await expect(pool.run("identity", {}, 1, "visible", () => "fallback")).resolves.toBe("fallback");
    expect(worker.terminated).toBe(true);
    await expect(pool.run("identity", {}, 2, "visible", () => "fallback-2")).resolves.toBe("fallback-2");
    pool.dispose();
  });

  it("records worker CPU separately from round-trip wait", async () => {
    const trace = createTransportMapPerformanceTrace({
      observeLongTasks: false,
    });
    const worker = new RespondingWorker();
    const pool = new TransportMapWorkerPool({
      size: 1,
      workerFactory: () => worker as unknown as Worker,
      trace,
    });

    trace.start();
    await expect(pool.run("identity", {}, 1, "visible", () => "fallback")).resolves.toBe("worker");
    const report = trace.stop();
    const workerEvent = report.events.find((event) => event.type === "worker_job");
    const roundTripMs = workerEvent?.metadata?.roundTripMs as number;
    const waitAndTransferMs = workerEvent?.metadata?.workerWaitAndTransferMs as number;

    expect(workerEvent?.metadata?.workerExecutionMs).toBe(5);
    expect(roundTripMs).toBeGreaterThanOrEqual(5);
    expect(waitAndTransferMs).toBeCloseTo(roundTripMs - 5, 8);
    expect(waitAndTransferMs).toBeGreaterThanOrEqual(0);
    pool.dispose();
  });

  it("discards stale queued viewport work before posting it to a Worker", async () => {
    const worker = new ControlledWorker();
    const pool = new TransportMapWorkerPool({
      size: 1,
      workerFactory: () => worker as unknown as Worker,
    });
    const active = pool.run("identity", {}, 1, "background", () => "fallback-active");
    const stale = pool.run("decode-chunk", {}, 1, "overscan", () => "fallback-stale");

    expect(worker.requests).toHaveLength(1);
    pool.cancelObsolete(2);
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.requests).toHaveLength(1);

    worker.respond(worker.requests[0]!.requestId, "worker-active");
    await expect(active).resolves.toBe("worker-active");
    expect(pool.getMetrics()).toMatchObject({
      jobsDiscardedBeforeExecution: 1,
      resultsDiscardedAsStale: 0,
      byTaskType: {
        "decode-chunk": { jobsDiscardedBeforeExecution: 1 },
      },
    });
    pool.dispose();
  });

  it("rejects a stale running result without invoking its fallback", async () => {
    const worker = new ControlledWorker();
    const pool = new TransportMapWorkerPool({
      size: 1,
      workerFactory: () => worker as unknown as Worker,
    });
    let fallbackCalled = false;
    const stale = pool.run("decode-chunk", {}, 1, "visible", () => {
      fallbackCalled = true;
      return "fallback";
    });

    pool.cancelObsolete(2);
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    worker.respond(worker.requests[0]!.requestId, "late-worker-result");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fallbackCalled).toBe(false);
    expect(pool.getMetrics()).toMatchObject({
      jobsDiscardedBeforeExecution: 0,
      resultsDiscardedAsStale: 1,
      byTaskType: {
        "decode-chunk": { resultsDiscardedAsStale: 1 },
      },
    });
    pool.dispose();
  });

  it("dispatches visible work before overscan, prefetch and background work", async () => {
    const worker = new ControlledWorker();
    const pool = new TransportMapWorkerPool({
      size: 1,
      workerFactory: () => worker as unknown as Worker,
    });
    const promises = [
      pool.run("identity", { id: "background" }, 1, "background", () => "fallback-background"),
      pool.run("identity", { id: "prefetch" }, 1, "prefetch", () => "fallback-prefetch"),
      pool.run("identity", { id: "overscan" }, 1, "overscan", () => "fallback-overscan"),
      pool.run("identity", { id: "visible" }, 1, "visible", () => "fallback-visible"),
    ];

    for (let index = 0; index < promises.length; index += 1) {
      const request = worker.requests[index];
      if (!request) throw new Error(`Missing controlled Worker request ${index}`);
      expect(request.payload).toMatchObject({ id: index === 0 ? "background" : index === 1 ? "visible" : index === 2 ? "overscan" : "prefetch" });
      worker.respond(request.requestId, request.payload);
      await Promise.resolve();
    }
    await expect(Promise.all(promises)).resolves.toEqual([
      "fallback-background",
      "fallback-prefetch",
      "fallback-overscan",
      "fallback-visible",
    ].map((value) => value === "fallback-background" ? { id: "background" } : value === "fallback-prefetch" ? { id: "prefetch" } : value === "fallback-overscan" ? { id: "overscan" } : { id: "visible" }));
    pool.dispose();
  });
});

class FailingWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(): void {
    this.onerror?.({ error: new Error("fixture worker failure"), message: "fixture worker failure" } as ErrorEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

class RespondingWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: { requestId: string; generation: number }): void {
    setTimeout(() => {
      this.onmessage?.({
        data: {
          schemaVersion: 1,
          requestId: request.requestId,
          generation: request.generation,
          taskType: "identity",
          ok: true,
          result: "worker",
          durationMs: 5,
        },
      } as MessageEvent);
    }, 10);
  }

  terminate(): void {}
}

class ControlledWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: TransportMapWorkerRequest[] = [];

  postMessage(request: TransportMapWorkerRequest): void {
    this.requests.push(request);
  }

  respond(requestId: string, result: unknown): void {
    const request = this.requests.find((candidate) => candidate.requestId === requestId);
    if (!request) throw new Error(`Unknown controlled Worker request ${requestId}`);
    this.onmessage?.({
      data: {
        schemaVersion: 1,
        requestId,
        generation: request.generation,
        taskType: request.taskType,
        ok: true,
        result,
        durationMs: 1,
      },
    } as MessageEvent);
  }

  terminate(): void {}
}
