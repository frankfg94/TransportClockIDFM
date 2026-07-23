import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import {
  buildNetworkGhostCanvasScene,
  buildNetworkGhostHitScene,
  createNetworkGhostTilePlan,
  hitTestNetworkGhostScene,
} from "../src/features/network-ghost/networkGhostCanvas";
import {
  createNetworkGhostSceneSignature,
  createSerializableNetworkGhostLines,
  createSerializableNetworkGhostPlan,
  createSerializableNetworkGhostRect,
} from "../src/features/network-ghost/networkGhostCanvasWorkerProtocol";
import type { NetworkGhostLineView } from "../src/features/network-ghost";

describe("network ghost canvas worker protocol", () => {
  it("removes Vue proxies before posting line geometry to a Worker", () => {
    const reactiveLines = reactive([createLine()]);
    const reactiveViewport = reactive({ x: 10, y: 20, width: 800, height: 500 });
    expect(() => structuredClone(reactiveLines)).toThrow();
    expect(() => structuredClone(reactiveViewport)).toThrow();

    const serialized = createSerializableNetworkGhostLines(reactiveLines);
    const viewport = createSerializableNetworkGhostRect(reactiveViewport);
    expect(() => structuredClone({ lines: serialized, viewport })).not.toThrow();
    expect(serialized[0].segments[0].polyline).toEqual(
      reactiveLines[0].segments[0].polyline,
    );
    expect(serialized[0].stations).toEqual([]);
    expect(serialized[0].geometryAttempts).toEqual([]);
  });

  it("serializes only tile metadata and keeps visible tiles ahead of overscan", () => {
    const lines = [createLine()];
    const options = createSceneOptions();
    const scene = buildNetworkGhostCanvasScene(lines, options);
    const plan = createNetworkGhostTilePlan(scene, {
      zoom: 2,
      viewport: { x: 120, y: 80, width: 700, height: 420 },
      pixelRatio: 2,
      tileSize: 256,
      maxTiles: 16,
    });
    const serialized = createSerializableNetworkGhostPlan(plan);

    expect(serialized.tiles).toHaveLength(plan.tiles.length);
    expect(serialized.tiles.every((tile) => !("lines" in tile))).toBe(true);
    const firstOverscan = serialized.tiles.findIndex((tile) => tile.priority === "overscan");
    const lastVisible = serialized.tiles.findLastIndex((tile) => tile.priority === "visible");
    expect(firstOverscan).toBeGreaterThan(lastVisible);
  });

  it("uses geometry and canvas layout in the immutable render signature", () => {
    const lines = [createLine()];
    const options = createSceneOptions();
    const original = createNetworkGhostSceneSignature(lines, options);
    const same = createNetworkGhostSceneSignature(structuredClone(lines), { ...options });
    const moved = structuredClone(lines);
    moved[0].segments[0].polyline![1].y += 0.01;

    expect(same).toBe(original);
    expect(createNetworkGhostSceneSignature(moved, options)).not.toBe(original);
    expect(
      createNetworkGhostSceneSignature(lines, { ...options, paddingX: options.paddingX + 1 }),
    ).not.toBe(original);
  });

  it("builds a lightweight hit index without rounded path decisions", () => {
    const lines = [createLine()];
    const hitScene = buildNetworkGhostHitScene(lines, createSceneOptions());
    const indexed = [...hitScene.spatialIndex.values()].flat();

    expect(hitScene.segmentCount).toBe(1);
    expect(indexed.length).toBeGreaterThan(0);
    expect(indexed.every((segment) => !("path" in segment) && !("corners" in segment))).toBe(
      true,
    );
    expect(hitTestNetworkGhostScene(hitScene, { x: 540, y: 310 }, 80)?.id).toBe(
      "line:test",
    );
  });
});

function createSceneOptions() {
  return {
    viewBoxWidth: 1080,
    viewBoxHeight: 620,
    paddingX: 78,
    paddingY: 68,
    zoom: 2,
  };
}

function createLine(): NetworkGhostLineView {
  return {
    id: "line:test",
    label: "Test",
    mode: "Bus",
    color: "#123456",
    textColor: "#ffffff",
    isBus: true,
    anchorStationId: "a",
    anchorX: 0.5,
    anchorY: 0.5,
    stations: [],
    geometrySource: "gtfs",
    geometryAttempts: [{ source: "gtfs", status: "success" }],
    loadOrder: 0,
    segments: [
      {
        id: "a-b",
        fromStationId: "a",
        toStationId: "b",
        fromX: 0.2,
        fromY: 0.5,
        toX: 0.8,
        toY: 0.5,
        polyline: [
          { x: 0.2, y: 0.5 },
          { x: 0.5, y: 0.54 },
          { x: 0.8, y: 0.5 },
        ],
        level: 0,
      },
    ],
  };
}
