import { GlobalIsochroneError, type GlobalIsochroneResult } from "./contracts";
import { GLOBAL_ISOCHRONE_RESPONSE_LIMIT, parseGlobalIsochroneResponse } from "./protocol";
import type { GlobalIsochroneWorkerRequest, GlobalIsochroneWorkerResponse } from "./client";

const scope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<GlobalIsochroneWorkerRequest>) => void): void;
  postMessage(message: GlobalIsochroneWorkerResponse): void;
};
const cache = new Map<string, { result: GlobalIsochroneResult; cost: number; expires: number }>();
const MAX_CACHE = 24 * 1024 * 1024;
let cacheBytes = 0;
let controller: AbortController | undefined;

async function select(request: GlobalIsochroneWorkerRequest): Promise<GlobalIsochroneResult> {
  controller?.abort();
  const current = controller = new AbortController();
  if (request.reload) { cache.clear(); cacheBytes = 0; }
  const key = JSON.stringify([request.url, request.mapDataVersion, request.scopes]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    cache.delete(key); cache.set(key, cached);
    return cached.result;
  }
  if (cached) { cache.delete(key); cacheBytes -= cached.cost; }
  const url = new URL(request.url);
  url.searchParams.set("mapVersion", request.mapDataVersion);
  url.searchParams.set("scopes", JSON.stringify(request.scopes));
  if (request.reload) url.searchParams.set("retry", String(request.id));
  const response = await fetch(url, { signal: current.signal, cache: request.reload ? "reload" : "default" });
  if (response.status === 404) throw new GlobalIsochroneError("missing");
  if (response.status === 409) throw new GlobalIsochroneError("incompatible");
  if (response.status === 422 || response.status === 400) throw new GlobalIsochroneError("invalid");
  if (!response.ok) throw new GlobalIsochroneError("unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new GlobalIsochroneError("invalid");
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > GLOBAL_ISOCHRONE_RESPONSE_LIMIT) { await reader.cancel(); throw new GlobalIsochroneError("invalid"); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  current.signal.throwIfAborted();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new GlobalIsochroneError("invalid"); }
  const result = parseGlobalIsochroneResponse(payload, request.mapDataVersion, request.scopes);
  const cost = bytes * 4;
  if (cost <= MAX_CACHE) {
    while (cache.size && (cacheBytes + cost > MAX_CACHE || cache.size >= 24)) {
      const first = cache.keys().next().value!;
      cacheBytes -= cache.get(first)!.cost; cache.delete(first);
    }
    cache.set(key, { result, cost, expires: Date.now() + 60_000 }); cacheBytes += cost;
  }
  return result;
}

scope.addEventListener("message", (event) => {
  const request = event.data;
  void select(request).then((result) => {
    scope.postMessage({ id: request.id, ok: true, result });
  }).catch((error: unknown) => {
    scope.postMessage({ id: request.id, ok: false, code: error instanceof GlobalIsochroneError ? error.code : "unavailable" });
  });
});
