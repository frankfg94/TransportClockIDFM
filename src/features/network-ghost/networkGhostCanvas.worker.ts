/// <reference lib="webworker" />

import {
  buildNetworkGhostCanvasScene,
  createNetworkGhostTilePlan,
  drawNetworkGhostCanvasTile,
  type NetworkGhostCanvasTile,
} from "./networkGhostCanvas";
import {
  createNetworkGhostSceneSignature,
  createSerializableNetworkGhostPlan,
  type NetworkGhostWorkerRenderRequest,
  type NetworkGhostWorkerRequest,
  type NetworkGhostWorkerResponse,
  type NetworkGhostWorkerTile,
} from "./networkGhostCanvasWorkerProtocol";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let latestGeneration = 0;

workerScope.onmessage = (event: MessageEvent<NetworkGhostWorkerRequest>) => {
  const request = event.data;
  latestGeneration = Math.max(latestGeneration, request.generation);
  if (request.type === "render") {
    void renderRequest(request);
  }
};

async function renderRequest(request: NetworkGhostWorkerRenderRequest): Promise<void> {
  const startedAt = performance.now();
  try {
    const scene = buildNetworkGhostCanvasScene(request.lines, request.sceneOptions);
    const plan = createNetworkGhostTilePlan(scene, request.tileOptions);
    const signature = createNetworkGhostSceneSignature(
      request.lines,
      request.sceneOptions,
    );
    const serializablePlan = createSerializableNetworkGhostPlan(plan);

    for (const phase of ["visible", "overscan"] as const) {
      const phaseTiles = plan.tiles.filter((tile) => tile.priority === phase);
      if (phaseTiles.length === 0 && phase === "overscan") continue;

      const rendered: NetworkGhostWorkerTile[] = [];
      for (const tile of phaseTiles) {
        if (request.generation !== latestGeneration) {
          closeTiles(rendered);
          return;
        }

        rendered.push(renderTile(tile, plan));
        await yieldToWorkerQueue();
      }

      if (request.generation !== latestGeneration) {
        closeTiles(rendered);
        return;
      }

      const response: NetworkGhostWorkerResponse = {
        type: "tiles",
        generation: request.generation,
        phase,
        signature,
        plan: serializablePlan,
        tiles: rendered,
        lineCount: scene.lines.length,
        segmentCount: scene.segmentCount,
        workerDurationMs: performance.now() - startedAt,
      };
      workerScope.postMessage(
        response,
        rendered.map((tile) => tile.bitmap),
      );
    }
  } catch (error) {
    const response: NetworkGhostWorkerResponse = {
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : "Canvas worker failed",
    };
    workerScope.postMessage(response);
  }
}

function renderTile(
  tile: NetworkGhostCanvasTile,
  plan: ReturnType<typeof createNetworkGhostTilePlan>,
): NetworkGhostWorkerTile {
  const canvas = new OffscreenCanvas(tile.pixelWidth, tile.pixelHeight);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("OffscreenCanvas 2D context unavailable");

  drawNetworkGhostCanvasTile(context, tile, plan);
  const { lines: _lines, ...metadata } = tile;
  return {
    ...metadata,
    bitmap: canvas.transferToImageBitmap(),
  };
}

function closeTiles(tiles: NetworkGhostWorkerTile[]): void {
  tiles.forEach((tile) => tile.bitmap.close());
}

function yieldToWorkerQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
