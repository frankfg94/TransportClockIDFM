import { shallowRef, triggerRef } from "vue";

export type VerdictDebugTaskStatus = "running" | "ready" | "error" | "cancelled";
export interface VerdictDebugTask {
  id: number; system: string; task: string; startMs: number; endMs?: number; durationMs?: number;
  status: VerdictDebugTaskStatus; details?: Record<string, unknown>;
}
export function createVerdictDebugTimeline(now: () => number = () => performance.now()) {
  const tasks = shallowRef<VerdictDebugTask[]>([]);
  let nextId = 0;
  return {
    tasks,
    clear() { tasks.value = []; nextId = 0; },
    begin(system: string, task: string, details?: Record<string, unknown>) {
      const entry: VerdictDebugTask = { id: ++nextId, system, task, startMs: Math.round(now()), status: "running", details };
      tasks.value.push(entry); triggerRef(tasks);
      // Bound the opt-in history across periodic refreshes, never the work.
      if (tasks.value.length > 2000) tasks.value.splice(0, tasks.value.length - 2000);
      const finish = (status: Exclude<VerdictDebugTaskStatus, "running"> = "ready", result?: Record<string, unknown>) => {
        if (entry.status !== "running") return;
        entry.endMs = Math.round(now()); entry.durationMs = entry.endMs - entry.startMs;
        entry.status = status; if (result) entry.details = { ...entry.details, ...result };
        triggerRef(tasks);
      };
      return Object.assign(finish, {
        // A subscriber can cancel before the worker releases its shared tree.
        // Annotate that later release without changing the cancellation time.
        annotate(result: Record<string, unknown>) {
          entry.details = { ...entry.details, ...result };
          triggerRef(tasks);
        },
      });
    },
  };
}
export const verdictDebugTimeline = createVerdictDebugTimeline();
export function isVerdictDebugEnabled(): boolean {
  return typeof window !== "undefined" && new URL(window.location.href).searchParams.get("debugVerdict") === "1";
}
export function beginVerdictDebugTask(system: string, task: string, details?: Record<string, unknown>) {
  return isVerdictDebugEnabled() ? verdictDebugTimeline.begin(system, task, details)
    : Object.assign(() => {}, { annotate: (_details: Record<string, unknown>) => {} });
}
