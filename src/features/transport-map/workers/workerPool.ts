import {
  createWorkerRequest,
  isCurrentGeneration,
  type TransportMapWorkerRequest,
  type TransportMapWorkerResponse,
  type TransportMapWorkerTaskType,
} from "./protocol";
import type {
  TransportMapPerformanceTrace,
  TransportMapTraceEventId,
} from "../performance/transportMapPerformanceTrace";

export interface WorkerPoolOptions {
  size?: number;
  workerFactory?: () => Worker;
  trace?: TransportMapPerformanceTrace;
}

export interface TransportMapWorkerTaskMetrics {
  completed: number;
  jobsDiscardedBeforeExecution: number;
  resultsDiscardedAsStale: number;
  queueWaitMs: number;
  workerExecutionMs: number;
}

export interface TransportMapWorkerPoolMetrics {
  pending: number;
  active: number;
  queued: number;
  completed: number;
  abandoned: number;
  jobsDiscardedBeforeExecution: number;
  resultsDiscardedAsStale: number;
  queueWaitMs: number;
  workerExecutionMs: number;
  byTaskType: Partial<Record<TransportMapWorkerTaskType, TransportMapWorkerTaskMetrics>>;
}

interface WorkerTask {
  request: TransportMapWorkerRequest;
  transferList: Transferable[];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  generation: number;
  priority: TransportMapWorkerRequest["priority"];
  fallback: () => unknown;
  taskType: TransportMapWorkerTaskType;
  trace?: TransportMapPerformanceTrace;
  traceEventId?: TransportMapTraceEventId;
  taskTraceEventId?: TransportMapTraceEventId;
  submittedAtMs: number;
  startedAtMs?: number;
  worker?: Worker;
  settled: boolean;
  stale: boolean;
  sequence: number;
}

const PRIORITY_RANK: Record<TransportMapWorkerRequest["priority"], number> = {
  critical: 0,
  visible: 1,
  overscan: 2,
  prefetch: 3,
  background: 4,
};

/**
 * Small priority-aware Worker scheduler. The pool owns a one-task queue per
 * worker so obsolete viewport work can be rejected before it crosses the
 * Worker boundary. A task already running in a Worker is allowed to finish,
 * but its result is discarded before it reaches a caller.
 */
export class TransportMapWorkerPool {
  readonly size: number;
  private readonly workerFactory?: () => Worker;
  private readonly trace?: TransportMapPerformanceTrace;
  private readonly workers: Worker[] = [];
  private readonly queued: WorkerTask[] = [];
  private readonly active = new Map<string, WorkerTask>();
  private readonly workerTasks = new Map<Worker, WorkerTask>();
  private readonly metricsByTaskType = new Map<TransportMapWorkerTaskType, TransportMapWorkerTaskMetrics>();
  private disposed = false;
  private currentGeneration = Number.NEGATIVE_INFINITY;
  private sequence = 0;
  private completedCount = 0;
  private abandonedCount = 0;

  constructor(options: WorkerPoolOptions = {}) {
    this.size = Math.max(1, Math.min(2, options.size ?? defaultPoolSize()));
    this.workerFactory = options.workerFactory;
    this.trace = options.trace;
    if (this.workerFactory) {
      for (let index = 0; index < this.size; index += 1) {
        const worker = this.workerFactory();
        worker.onmessage = (event: MessageEvent<TransportMapWorkerResponse>) =>
          this.handleResponse(event.data, worker);
        worker.onerror = (event) => this.handleError(event, worker);
        this.workers.push(worker);
      }
    }
  }

  get workerCount(): number {
    return this.workers.length;
  }

  getMetrics(): TransportMapWorkerPoolMetrics {
    const byTaskType = {} as Partial<Record<TransportMapWorkerTaskType, TransportMapWorkerTaskMetrics>>;
    for (const [taskType, metrics] of this.metricsByTaskType) {
      byTaskType[taskType] = { ...metrics };
    }
    const totals = this.getTaskMetrics();
    return {
      pending: this.queued.length + this.active.size,
      active: this.active.size,
      queued: this.queued.length,
      completed: this.completedCount,
      abandoned: this.abandonedCount,
      jobsDiscardedBeforeExecution: totals.jobsDiscardedBeforeExecution,
      resultsDiscardedAsStale: totals.resultsDiscardedAsStale,
      queueWaitMs: totals.queueWaitMs,
      workerExecutionMs: totals.workerExecutionMs,
      byTaskType,
    };
  }

  run<TPayload, TResult>(
    taskType: TransportMapWorkerTaskType,
    payload: TPayload,
    generation: number,
    priority: TransportMapWorkerRequest["priority"] = "visible",
    mainThreadFallback: () => TResult | Promise<TResult>,
    transferList: Transferable[] = [],
    parentId?: TransportMapTraceEventId,
  ): Promise<TResult> {
    if (this.disposed) return Promise.reject(new Error("Worker pool disposed"));
    const trace = this.trace?.isRunning ? this.trace : undefined;
    const submittedAtMs = nowMs();
    const traceEventId = trace?.begin("worker_job", {
      taskType,
      generation,
      priority,
      execution: this.workers.length === 0 ? "main-thread-fallback" : "worker",
    }, parentId);
    const taskTraceEventId = trace?.begin(workerEventType(taskType), {
      taskType,
      generation,
      priority,
    }, traceEventId);
    if (this.workers.length === 0) {
      return Promise.resolve()
        .then(mainThreadFallback)
        .then((result) => {
          const roundTripMs = nowMs() - submittedAtMs;
          const timing = {
            execution: "main-thread-fallback",
            workerExecutionMs: roundTripMs,
            roundTripMs,
            workerWaitAndTransferMs: 0,
            queueWaitMs: 0,
          };
          trace?.end(taskTraceEventId, timing);
          trace?.end(traceEventId, timing);
          return result;
        }, (error) => {
          const roundTripMs = nowMs() - submittedAtMs;
          const timing = {
            execution: "main-thread-fallback",
            workerExecutionMs: roundTripMs,
            roundTripMs,
            workerWaitAndTransferMs: 0,
            queueWaitMs: 0,
            failed: true,
          };
          trace?.end(taskTraceEventId, timing);
          trace?.end(traceEventId, timing);
          throw error;
        });
    }

    const request = createWorkerRequest(taskType, payload, generation, priority);
    return new Promise<TResult>((resolve, reject) => {
      this.queued.push({
        request,
        transferList,
        resolve: resolve as (value: unknown) => void,
        reject,
        generation,
        priority,
        fallback: mainThreadFallback,
        taskType,
        trace,
        traceEventId,
        taskTraceEventId,
        submittedAtMs,
        settled: false,
        stale: false,
        sequence: this.sequence++,
      });
      this.sortQueue();
      this.pump();
    });
  }

  cancelObsolete(generation: number): void {
    this.currentGeneration = Math.max(this.currentGeneration, generation);

    for (let index = this.queued.length - 1; index >= 0; index -= 1) {
      const task = this.queued[index]!;
      if (!this.isObsoleteViewportTask(task)) continue;
      this.queued.splice(index, 1);
      this.discardBeforeExecution(task);
    }

    for (const task of this.active.values()) {
      if (!this.isObsoleteViewportTask(task) || task.stale) continue;
      task.stale = true;
      this.abandonedCount += 1;
      this.rejectTask(task, new DOMException("Stale worker generation", "AbortError"));
    }
    this.pump();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const task of this.queued.splice(0)) {
      this.finishUnstartedTrace(task, { disposed: true });
      this.rejectTask(task, new DOMException("Disposed", "AbortError"));
    }
    for (const task of this.active.values()) {
      this.finishTrace(task, { disposed: true });
      this.rejectTask(task, new DOMException("Disposed", "AbortError"));
    }
    this.active.clear();
    this.workerTasks.clear();
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
  }

  private sortQueue(): void {
    this.queued.sort((left, right) =>
      PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
      right.generation - left.generation ||
      left.sequence - right.sequence,
    );
  }

  private pump(): void {
    if (this.disposed) return;
    this.sortQueue();
    for (const worker of this.workers) {
      if (this.workerTasks.has(worker)) continue;
      const task = this.takeNextRunnableTask();
      if (!task) break;
      task.worker = worker;
      task.startedAtMs = nowMs();
      this.active.set(task.request.requestId, task);
      this.workerTasks.set(worker, task);
      try {
        const postStartedAt = nowMs();
        const transferBytes = transferableByteLength(task.transferList);
        worker.postMessage(task.request, task.transferList);
        task.trace?.recordDuration("worker_post_message", nowMs() - postStartedAt, {
          taskType: task.taskType,
          generation: task.generation,
          priority: task.priority,
          payloadBytes: transferBytes,
          transferCount: task.transferList.length,
        }, task.taskTraceEventId);
      } catch {
        this.active.delete(task.request.requestId);
        this.workerTasks.delete(worker);
        this.runFallback(task, "main-thread-fallback", true);
      }
    }
  }

  private takeNextRunnableTask(): WorkerTask | undefined {
    while (this.queued.length > 0) {
      const task = this.queued.shift()!;
      if (this.isObsoleteViewportTask(task)) {
        this.discardBeforeExecution(task);
        continue;
      }
      return task;
    }
    return undefined;
  }

  private isObsoleteViewportTask(task: WorkerTask): boolean {
    // Binary compilation has its own generation domain in DeckGlRenderer;
    // data-source cancellation must not discard it accidentally. Prefetches
    // are intentionally retained so the overscan cache can warm in the idle
    // gap after a viewport change.
    if (task.taskType !== "decode-chunk") return false;
    if (task.priority === "prefetch") return false;
    return task.generation < this.currentGeneration;
  }

  private discardBeforeExecution(task: WorkerTask): void {
    const queueWaitMs = Math.max(0, nowMs() - task.submittedAtMs);
    this.abandonedCount += 1;
    this.recordTaskMetric(task.taskType, "jobsDiscardedBeforeExecution", 1);
    this.recordTaskMetric(task.taskType, "queueWaitMs", queueWaitMs);
    this.trace?.recordCounter(`worker.jobsDiscardedBeforeExecution.${task.taskType}`);
    this.finishUnstartedTrace(task, {
      execution: "not-started",
      stale: true,
      cancelled: true,
      queueWaitMs,
      roundTripMs: queueWaitMs,
      workerExecutionMs: 0,
      workerWaitAndTransferMs: queueWaitMs,
    });
    this.rejectTask(task, new DOMException("Stale worker generation", "AbortError"));
  }

  private handleResponse(response: TransportMapWorkerResponse, worker: Worker): void {
    const task = this.active.get(response.requestId);
    if (!task) return;
    this.active.delete(response.requestId);
    if (this.workerTasks.get(worker) === task) this.workerTasks.delete(worker);

    const roundTripMs = Math.max(0, nowMs() - task.submittedAtMs);
    const queueWaitMs = Math.max(0, (task.startedAtMs ?? nowMs()) - task.submittedAtMs);
    const workerExecutionMs = Number.isFinite(response.durationMs)
      ? Math.max(0, response.durationMs)
      : 0;
    const timing = {
      workerExecutionMs,
      roundTripMs,
      queueWaitMs,
      workerWaitAndTransferMs: Math.max(0, roundTripMs - workerExecutionMs),
    };
    const stale = task.stale ||
      this.isObsoleteViewportTask(task) ||
      !isCurrentGeneration(response, task.generation);
    if (stale) {
      this.recordTaskMetric(task.taskType, "resultsDiscardedAsStale", 1);
      this.recordTaskMetric(task.taskType, "queueWaitMs", queueWaitMs);
      this.recordTaskMetric(task.taskType, "workerExecutionMs", workerExecutionMs);
      this.trace?.recordCounter(`worker.resultsDiscardedAsStale.${task.taskType}`);
      this.finishTrace(task, { execution: "worker", stale: true, ...timing });
      if (!task.settled) this.rejectTask(task, new DOMException("Stale worker response", "AbortError"));
      this.pump();
      return;
    }

    const taskMetrics = this.metricsByTaskType.get(task.taskType) ?? {
      completed: 0,
      jobsDiscardedBeforeExecution: 0,
      resultsDiscardedAsStale: 0,
      queueWaitMs: 0,
      workerExecutionMs: 0,
    };
    taskMetrics.completed += 1;
    this.metricsByTaskType.set(task.taskType, taskMetrics);
    this.recordTaskMetric(task.taskType, "queueWaitMs", queueWaitMs);
    this.recordTaskMetric(task.taskType, "workerExecutionMs", workerExecutionMs);
    this.completedCount += 1;
    if (response.ok) {
      this.finishTrace(task, { execution: "worker", ...timing });
      task.resolve(response.result);
    } else {
      this.runFallback(task, "worker-fallback", false, timing);
    }
    this.pump();
  }

  private handleError(event: ErrorEvent, _worker: Worker): void {
    if (this.disposed) return;
    const tasks = [
      ...this.active.values(),
      ...this.queued.splice(0),
    ];
    this.active.clear();
    this.workerTasks.clear();
    for (const task of tasks) {
      if (task.stale || this.isObsoleteViewportTask(task)) {
        this.finishTrace(task, { execution: "worker-error", stale: true, cancelled: true });
        if (!task.settled) this.rejectTask(task, new DOMException("Stale worker generation", "AbortError"));
      } else {
        this.runFallback(task, "worker-error-fallback", true);
      }
    }
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    void event;
  }

  private runFallback(
    task: WorkerTask,
    execution: "main-thread-fallback" | "worker-fallback" | "worker-error-fallback",
    postMessageFailed: boolean,
    workerTiming?: {
      workerExecutionMs: number;
      roundTripMs: number;
      queueWaitMs: number;
      workerWaitAndTransferMs: number;
    },
  ): void {
    if (task.settled) return;
    const fallbackStartedAt = nowMs();
    const queueWaitMs = workerTiming?.queueWaitMs ?? Math.max(0, fallbackStartedAt - task.submittedAtMs);
    Promise.resolve().then(task.fallback).then((result) => {
      const roundTripMs = nowMs() - task.submittedAtMs;
      const fallbackDurationMs = Math.max(0, nowMs() - fallbackStartedAt);
      const timing = {
        execution,
        postMessageFailed: postMessageFailed || undefined,
        workerExecutionMs: workerTiming?.workerExecutionMs ?? fallbackDurationMs,
        roundTripMs: workerTiming?.roundTripMs ?? roundTripMs,
        queueWaitMs,
        workerWaitAndTransferMs: workerTiming?.workerWaitAndTransferMs ?? 0,
      };
      this.finishTrace(task, timing);
      task.settled = true;
      task.resolve(result);
    }, (error) => {
      const roundTripMs = nowMs() - task.submittedAtMs;
      const fallbackDurationMs = Math.max(0, nowMs() - fallbackStartedAt);
      const timing = {
        execution,
        postMessageFailed: postMessageFailed || undefined,
        workerExecutionMs: workerTiming?.workerExecutionMs ?? fallbackDurationMs,
        roundTripMs: workerTiming?.roundTripMs ?? roundTripMs,
        queueWaitMs,
        workerWaitAndTransferMs: workerTiming?.workerWaitAndTransferMs ?? 0,
        failed: true,
      };
      this.finishTrace(task, timing);
      task.settled = true;
      task.reject(error);
    });
  }

  private rejectTask(task: WorkerTask, reason: unknown): void {
    if (task.settled) return;
    task.settled = true;
    task.reject(reason);
  }

  private finishUnstartedTrace(task: WorkerTask, metadata: Record<string, unknown>): void {
    task.trace?.end(task.taskTraceEventId, metadata);
    task.trace?.end(task.traceEventId, metadata);
  }

  private finishTrace(task: WorkerTask, metadata: Record<string, unknown>): void {
    task.trace?.end(task.taskTraceEventId, metadata);
    task.trace?.end(task.traceEventId, metadata);
  }

  private getTaskMetrics(): TransportMapWorkerTaskMetrics {
    const totals: TransportMapWorkerTaskMetrics = {
      completed: this.completedCount,
      jobsDiscardedBeforeExecution: 0,
      resultsDiscardedAsStale: 0,
      queueWaitMs: 0,
      workerExecutionMs: 0,
    };
    for (const metrics of this.metricsByTaskType.values()) {
      totals.jobsDiscardedBeforeExecution += metrics.jobsDiscardedBeforeExecution;
      totals.resultsDiscardedAsStale += metrics.resultsDiscardedAsStale;
      totals.queueWaitMs += metrics.queueWaitMs;
      totals.workerExecutionMs += metrics.workerExecutionMs;
    }
    return totals;
  }

  private recordTaskMetric(
    taskType: TransportMapWorkerTaskType,
    field: keyof Omit<TransportMapWorkerTaskMetrics, "completed">,
    value: number,
  ): void {
    const metrics = this.metricsByTaskType.get(taskType) ?? {
      completed: 0,
      jobsDiscardedBeforeExecution: 0,
      resultsDiscardedAsStale: 0,
      queueWaitMs: 0,
      workerExecutionMs: 0,
    };
    metrics[field] += value;
    this.metricsByTaskType.set(taskType, metrics);
  }
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function transferableByteLength(transferList: readonly Transferable[]): number {
  let total = 0;
  for (const transfer of transferList) {
    const byteLength = (transfer as { byteLength?: unknown }).byteLength;
    total += typeof byteLength === "number" && Number.isFinite(byteLength) ? byteLength : 0;
  }
  return total;
}

function workerEventType(taskType: TransportMapWorkerTaskType): "worker_job" | "worker_decode" | "worker_binary_compile" {
  if (taskType === "decode-chunk") return "worker_decode";
  if (taskType === "compile-deck-paths") return "worker_binary_compile";
  return "worker_job";
}

function defaultPoolSize(): number {
  return typeof navigator !== "undefined" && navigator.hardwareConcurrency <= 4 ? 1 : 2;
}
