import {
  transferableBuffers,
  type TransportMapWorkerRequest,
  type TransportMapWorkerResponse,
  type TransportMapWorkerContinue,
  type TransportMapWorkerPart,
} from "./protocol";
import { compileDeckPathPayload, type DeckPathCompilePayload } from "../render/deckgl/deckPathPacket";
import { assetResultParts, decodeCatalogAsset, decodeRegionalAsset, type CatalogDecodePayload, type RegionalDecodePayload } from "./assetDecodeTasks";
import type { GlobalMapChunkPayload } from "../contracts/manifest";

interface AssetStream {
  request: TransportMapWorkerRequest;
  parts: Generator<TransportMapWorkerPart>;
  result: unknown;
  cpuMs: number;
}
const streams = new Map<string, AssetStream>();

function sendNextPart(stream: AssetStream): void {
  const startedAt = performance.now();
  const next = stream.parts.next();
  const response: TransportMapWorkerResponse = {
    schemaVersion: 1, requestId: stream.request.requestId, generation: stream.request.generation,
    ok: true, durationMs: stream.cpuMs,
    ...(next.done ? { result: stream.result } : { part: next.value }),
  };
  if (next.done) streams.delete(stream.request.requestId);
  self.postMessage(response, next.done ? transferableBuffers(stream.result) : []);
  stream.cpuMs += performance.now() - startedAt;
}

self.onmessage = (event: MessageEvent<TransportMapWorkerRequest | TransportMapWorkerContinue>) => {
  const message = event.data;
  if ("continue" in message) {
    const stream = streams.get(message.requestId);
    if (stream) sendNextPart(stream);
    return;
  }
  const request = message;
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  try {
    if (request.taskType === "decode-catalog" || request.taskType === "decode-regional" || request.taskType === "decode-chunk") {
      let parts: Generator<TransportMapWorkerPart>;
      let metadata: unknown;
      if (request.taskType === "decode-catalog") {
        const decoded = decodeCatalogAsset(request.payload as CatalogDecodePayload);
        parts = (function* () {
          yield* assetResultParts("lines", decoded.network.lines);
          yield* assetResultParts("stations", decoded.network.stations);
          yield* assetResultParts("entrances", decoded.network.entrances);
        })();
        metadata = { bounds: decoded.network.bounds, stationIndex: decoded.stationIndex };
      } else if (request.taskType === "decode-regional") {
        parts = assetResultParts("paths", decodeRegionalAsset(request.payload as RegionalDecodePayload));
        metadata = {};
      } else {
        const { paths, ...header } = JSON.parse((request.payload as { raw: string }).raw) as GlobalMapChunkPayload;
        parts = assetResultParts("paths", paths);
        metadata = { ...header, paths: [] };
      }
      const stream: AssetStream = { request, parts, result: metadata, cpuMs: performance.now() - startedAt };
      streams.set(request.requestId, stream);
      sendNextPart(stream);
      return;
    }
    const result = request.taskType === "identity"
      ? request.payload
      : request.taskType === "compile-deck-paths"
        ? compileDeckPathPayload(request.payload as DeckPathCompilePayload)
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
