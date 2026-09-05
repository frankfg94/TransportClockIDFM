import {
  transferableBuffers,
  type TransportMapWorkerRequest,
  type TransportMapWorkerResponse,
} from "./protocol";
import { createDeckPathBinaryPacket } from "../render/deckgl/deckPathPacket";
import type { TransportMapPathRenderRecord } from "../render/transportMapRenderModel";

self.onmessage = (event: MessageEvent<TransportMapWorkerRequest>) => {
  const request = event.data;
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  try {
    const result = request.taskType === "identity"
      ? request.payload
      : request.taskType === "decode-chunk"
        ? JSON.parse((request.payload as { raw: string }).raw)
      : request.taskType === "compile-deck-paths"
        ? createDeckPathBinaryPacket(
            (request.payload as { records: TransportMapPathRenderRecord[] }).records,
            (request.payload as { key: string }).key,
          )
        : undefined;
    const response: TransportMapWorkerResponse = {
      schemaVersion: 1,
      requestId: request.requestId,
      generation: request.generation,
      ok: true,
      result,
      durationMs: (typeof performance === "undefined" ? Date.now() : performance.now()) - startedAt,
    };
    self.postMessage(response, transferableBuffers(response.result));
  } catch (error) {
    const response: TransportMapWorkerResponse = {
      schemaVersion: 1,
      requestId: request.requestId,
      generation: request.generation,
      ok: false,
      error: { code: "worker-task-failed", message: error instanceof Error ? error.message : String(error) },
      durationMs: (typeof performance === "undefined" ? Date.now() : performance.now()) - startedAt,
    };
    self.postMessage(response);
  }
};
