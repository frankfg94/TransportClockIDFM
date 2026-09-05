import {
  GlobalIsochroneError,
  type GlobalIsochroneErrorCode,
  type GlobalIsochroneRequest,
  type GlobalIsochroneResult,
} from "./contracts";

import { GLOBAL_ISOCHRONE_API } from "./protocol";
import { toServerApiUrl } from "../../../services/serverApi";

export interface GlobalIsochroneWorkerRequest {
  id: number;
  url: string;
  mapDataVersion: string;
  scopes: GlobalIsochroneRequest[];
  reload: boolean;
}

export type GlobalIsochroneWorkerResponse =
  | { id: number; ok: true; result: GlobalIsochroneResult }
  | { id: number; ok: false; code: GlobalIsochroneErrorCode };

export interface GlobalIsochroneClient {
  select(scopes: GlobalIsochroneRequest[], mapDataVersion: string, reload?: boolean): Promise<GlobalIsochroneResult>;
  dispose(): void;
}

export function resolveGlobalIsochroneUrl(): string {
  return new URL(toServerApiUrl(GLOBAL_ISOCHRONE_API), window.location.href).href;
}

export function createGlobalIsochroneClient(): GlobalIsochroneClient {
  const worker = new Worker(new URL("./globalIsochrones.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, {
    resolve: (result: GlobalIsochroneResult) => void;
    reject: (error: GlobalIsochroneError) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  let sequence = 0;
  let disposed = false;

  function dispose(): void {
    disposed = true;
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new GlobalIsochroneError("unavailable"));
    }
    pending.clear();
  }

  worker.addEventListener("error", dispose);
  worker.addEventListener("messageerror", dispose);
  worker.addEventListener("message", (event: MessageEvent<GlobalIsochroneWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.ok) request.resolve(response.result);
    else request.reject(new GlobalIsochroneError(response.code));
  });

  return {
    select(scopes, mapDataVersion, reload = false) {
      if (disposed) return Promise.reject(new GlobalIsochroneError("unavailable"));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(dispose, 60_000);
        pending.set(id, { resolve, reject, timer });
        try {
          worker.postMessage({ id, scopes, mapDataVersion, url: resolveGlobalIsochroneUrl(), reload } satisfies GlobalIsochroneWorkerRequest);
        } catch { dispose(); }
      });
    },
    dispose,
  };
}
