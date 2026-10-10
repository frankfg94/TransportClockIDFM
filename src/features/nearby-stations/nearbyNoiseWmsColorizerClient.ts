import {
  recolorNearbyNoisePixelRange,
  type NearbyNoiseWmsWorkerRequest,
  type NearbyNoiseWmsWorkerResponse,
} from "./nearbyNoiseWmsColorizer";

export interface NearbyNoiseWmsColorizedImage {
  href: string;
  width: number;
  height: number;
  levels: Uint8Array;
}

interface WorkerColorizedImage {
  blob: Blob;
  width: number;
  height: number;
  levels: Uint8Array;
}

interface PendingColorization {
  resolve: (image: WorkerColorizedImage) => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
  onAbort: () => void;
}

const MAIN_THREAD_PIXELS_PER_BATCH = 16_384;

export class NearbyNoiseWmsColorizer {
  private worker: Worker | undefined;
  private workerUnavailable = false;
  private requestSequence = 0;
  private readonly pending = new Map<number, PendingColorization>();

  async recolor(blob: Blob, signal: AbortSignal): Promise<NearbyNoiseWmsColorizedImage> {
    const worker = this.getWorker();
    if (worker) {
      try {
        const image = await this.recolorInWorker(blob, signal, worker);
        return {
          href: URL.createObjectURL(image.blob),
          width: image.width,
          height: image.height,
          levels: image.levels,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        this.stopWorker(true);
      }
    }

    return this.recolorOnMainThread(blob, signal);
  }

  dispose(): void {
    this.stopWorker(true);
  }

  private getWorker(): Worker | undefined {
    if (this.workerUnavailable || typeof Worker === "undefined") return undefined;
    if (this.worker) return this.worker;

    try {
      this.worker = new Worker(new URL("./nearbyNoiseWms.worker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", (event: MessageEvent<NearbyNoiseWmsWorkerResponse>) => {
        const request = this.pending.get(event.data.id);
        if (!request) return;
        this.releasePending(event.data.id, request);
        if (event.data.ok) {
          request.resolve({
            width: event.data.width,
            height: event.data.height,
            levels: new Uint8Array(event.data.levels),
            blob: event.data.blob,
          });
        } else {
          request.reject(new Error(event.data.message));
        }
      });
      this.worker.addEventListener("error", () => this.stopWorker(true));
      this.worker.addEventListener("messageerror", () => this.stopWorker(true));
      return this.worker;
    } catch {
      this.workerUnavailable = true;
      return undefined;
    }
  }

  private recolorInWorker(blob: Blob, signal: AbortSignal, worker: Worker): Promise<WorkerColorizedImage> {
    const id = ++this.requestSequence;
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(createAbortError());
        return;
      }

      const onAbort = (): void => {
        this.pending.delete(id);
        signal.removeEventListener("abort", onAbort);
        try { worker.postMessage({ id, type: "cancel" }); } catch { /* worker may already be stopped */ }
        reject(createAbortError());
      };
      this.pending.set(id, { resolve, reject, signal, onAbort });
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        worker.postMessage({ id, type: "recolor", blob } satisfies NearbyNoiseWmsWorkerRequest);
      } catch (error) {
        this.releasePending(id, this.pending.get(id));
        reject(error instanceof Error ? error : new Error("Unable to send noise image to the worker."));
      }
    });
  }

  private releasePending(id: number, request: PendingColorization | undefined): void {
    if (!request) return;
    request.signal.removeEventListener("abort", request.onAbort);
    this.pending.delete(id);
  }

  private stopWorker(markUnavailable = false): void {
    if (markUnavailable) this.workerUnavailable = true;
    this.worker?.terminate();
    this.worker = undefined;
    for (const [id, request] of this.pending) {
      this.releasePending(id, request);
      request.reject(new Error("Noise image worker is unavailable."));
    }
  }

  private async recolorOnMainThread(blob: Blob, signal: AbortSignal): Promise<NearbyNoiseWmsColorizedImage> {
    const bitmap = await createImageBitmap(blob);
    try {
      throwIfAborted(signal);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas is unavailable for the detailed noise overlay.");

      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const levels = new Uint8Array(bitmap.width * bitmap.height);
      for (let startPixel = 0; startPixel < levels.length; startPixel += MAIN_THREAD_PIXELS_PER_BATCH) {
        throwIfAborted(signal);
        recolorNearbyNoisePixelRange(
          pixels.data,
          levels,
          startPixel,
          Math.min(levels.length, startPixel + MAIN_THREAD_PIXELS_PER_BATCH),
        );
        await yieldToMainThread();
      }
      throwIfAborted(signal);
      context.putImageData(pixels, 0, 0);

      const recolored = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to encode the detailed noise overlay.")), "image/png");
      });
      throwIfAborted(signal);
      return {
        href: URL.createObjectURL(recolored),
        width: bitmap.width,
        height: bitmap.height,
        levels,
      };
    } finally {
      bitmap.close();
    }
  }
}

function createAbortError(): DOMException {
  return new DOMException("Noise image processing was cancelled.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError();
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
