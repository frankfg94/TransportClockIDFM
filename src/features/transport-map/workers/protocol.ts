export const TRANSPORT_MAP_WORKER_PROTOCOL_VERSION = 1 as const;

export type TransportMapWorkerTaskType = "decode-chunk" | "decode-catalog" | "decode-regional" | "compile-deck-paths" | "identity";

export type TransportMapWorkerCollection = "lines" | "stations" | "entrances" | "paths";

/** An acknowledged batch bounds structured-clone work on the receiving thread. */
export interface TransportMapWorkerPart {
  collection: TransportMapWorkerCollection;
  items: unknown[];
}

export interface TransportMapWorkerContinue {
  schemaVersion: typeof TRANSPORT_MAP_WORKER_PROTOCOL_VERSION;
  requestId: string;
  continue: true;
}

export interface TransportMapWorkerRequest<T = unknown> {
  schemaVersion: typeof TRANSPORT_MAP_WORKER_PROTOCOL_VERSION;
  requestId: string;
  generation: number;
  taskType: TransportMapWorkerTaskType;
  priority: "critical" | "visible" | "overscan" | "prefetch" | "background";
  payload: T;
}

export interface TransportMapWorkerResponse<T = unknown> {
  schemaVersion: typeof TRANSPORT_MAP_WORKER_PROTOCOL_VERSION;
  requestId: string;
  generation: number;
  ok: boolean;
  result?: T;
  part?: TransportMapWorkerPart;
  error?: { code: string; message: string };
  durationMs: number;
}

export function createWorkerRequest<T>(
  taskType: TransportMapWorkerTaskType,
  payload: T,
  generation: number,
  priority: TransportMapWorkerRequest["priority"] = "visible",
): TransportMapWorkerRequest<T> {
  return {
    schemaVersion: TRANSPORT_MAP_WORKER_PROTOCOL_VERSION,
    requestId: `map-${generation}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    generation,
    taskType,
    priority,
    payload,
  };
}

export function isCurrentGeneration(
  response: Pick<TransportMapWorkerResponse, "generation">,
  currentGeneration: number,
): boolean {
  return response.generation >= currentGeneration;
}

export function transferableBuffers(value: unknown): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  const visit = (entry: unknown): void => {
    if (entry instanceof ArrayBuffer) {
      if (!seen.has(entry)) {
        seen.add(entry);
        buffers.push(entry);
      }
      return;
    }
    if (ArrayBuffer.isView(entry)) {
      if (entry.buffer instanceof ArrayBuffer && !seen.has(entry.buffer)) {
        seen.add(entry.buffer);
        buffers.push(entry.buffer);
      }
      return;
    }
    if (Array.isArray(entry)) {
      for (const child of entry) visit(child);
      return;
    }
    if (entry && typeof entry === "object") {
      for (const child of Object.values(entry)) visit(child);
    }
  };
  visit(value);
  return buffers;
}
