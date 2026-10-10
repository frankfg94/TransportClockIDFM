/// <reference lib="webworker" />

import {
  recolorNearbyNoisePixelRange,
  type NearbyNoiseWmsWorkerRequest,
  type NearbyNoiseWmsWorkerResponse,
} from "./nearbyNoiseWmsColorizer";

const PIXELS_PER_BATCH = 65_536;
const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const cancelledRequests = new Set<number>();

workerScope.addEventListener("message", (event: MessageEvent<NearbyNoiseWmsWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelledRequests.add(request.id);
    return;
  }
  void recolor(request);
});

async function recolor(request: Extract<NearbyNoiseWmsWorkerRequest, { type: "recolor" }>): Promise<void> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(request.blob);
    if (cancelledRequests.has(request.id)) return;

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("OffscreenCanvas 2D context unavailable");

    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const levels = new Uint8Array(bitmap.width * bitmap.height);
    for (let startPixel = 0; startPixel < levels.length; startPixel += PIXELS_PER_BATCH) {
      if (cancelledRequests.has(request.id)) return;
      recolorNearbyNoisePixelRange(
        pixels.data,
        levels,
        startPixel,
        Math.min(levels.length, startPixel + PIXELS_PER_BATCH),
      );
      await yieldToWorkerQueue();
    }
    if (cancelledRequests.has(request.id)) return;

    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (cancelledRequests.has(request.id)) return;

    const response: NearbyNoiseWmsWorkerResponse = {
      id: request.id,
      ok: true,
      blob,
      width: bitmap.width,
      height: bitmap.height,
      levels: levels.buffer as ArrayBuffer,
    };
    workerScope.postMessage(response, [response.levels]);
  } catch (error) {
    if (!cancelledRequests.has(request.id)) {
      workerScope.postMessage({
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : "Noise image colorization failed",
      } satisfies NearbyNoiseWmsWorkerResponse);
    }
  } finally {
    bitmap?.close();
    cancelledRequests.delete(request.id);
  }
}

function yieldToWorkerQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
