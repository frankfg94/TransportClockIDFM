import { describe, expect, it, vi } from "vitest";
import {
  buildNetworkGhostCanvasScene,
  createNetworkGhostTilePlan,
  hitTestNetworkGhostScene,
  NetworkGhostTileLruCache,
} from "../src/features/network-ghost/networkGhostCanvas";
import type { NetworkGhostLineView } from "../src/features/network-ghost";

describe("network ghost canvas renderer", () => {
  it.each([
    { label: "Gare du Nord", lineCount: 38, segmentCount: 1_261 },
    { label: "Châtelet", lineCount: 33, segmentCount: 1_550 },
  ])(
    "groups the $label load profile into one scene batch per line",
    ({ lineCount, segmentCount }) => {
      const scene = buildNetworkGhostCanvasScene(
        createLoadProfile(lineCount, segmentCount),
        createSceneOptions(),
      );

      expect(scene.lines).toHaveLength(lineCount);
      expect(scene.segmentCount).toBe(segmentCount);
      expect(scene.lines.reduce((count, line) => count + line.segments.length, 0)).toBe(
        segmentCount,
      );
    },
  );

  it("limits visible and overscan tiles while keeping the count independent from DPR", () => {
    const scene = buildNetworkGhostCanvasScene(createLoadProfile(38, 1_261), createSceneOptions());
    const viewport = { x: 120, y: 80, width: 1_632, height: 860 };
    const standard = createNetworkGhostTilePlan(scene, {
      zoom: 2,
      viewport,
      pixelRatio: 1,
      tileSize: 512,
      maxTiles: 16,
    });
    const retina = createNetworkGhostTilePlan(scene, {
      zoom: 2,
      viewport,
      pixelRatio: 2,
      tileSize: 512,
      maxTiles: 16,
    });

    expect(standard.tiles.length).toBeLessThanOrEqual(16);
    expect(retina.tiles).toHaveLength(standard.tiles.length);
    expect(retina.tiles.map((tile) => tile.id)).toEqual(standard.tiles.map((tile) => tile.id));
    expect(retina.tiles.every((tile) => tile.pixelWidth === tile.width * 2)).toBe(true);
    expect(new Set(standard.tiles.map((tile) => tile.id)).size).toBe(standard.tiles.length);
    expect(standard.tiles.some((tile) => tile.priority === "visible")).toBe(true);
    expect(standard.tiles.some((tile) => tile.priority === "overscan")).toBe(true);
  });

  it("culls segments outside the tile and batches intersecting segments by line", () => {
    const line = createLine("bus:test", [
      createSegment("visible-a", 0.05, 0.08, 0.14, 0.08),
      createSegment("visible-b", 0.12, 0.08, 0.2, 0.12),
      createSegment("outside", 0.82, 0.82, 0.92, 0.92),
    ]);
    const scene = buildNetworkGhostCanvasScene([line], createSceneOptions());
    const plan = createNetworkGhostTilePlan(scene, {
      zoom: 1,
      viewport: { x: 0, y: 0, width: 260, height: 220 },
      pixelRatio: 1,
      tileSize: 512,
      maxTiles: 16,
    });
    const visibleTile = plan.tiles.find((tile) => tile.priority === "visible");

    expect(visibleTile?.lines).toHaveLength(1);
    expect(visibleTile?.lines[0].line.id).toBe("bus:test");
    expect(visibleTile?.lines[0].segments.map((segment) => segment.id)).toEqual([
      "visible-a",
      "visible-b",
    ]);
    expect(visibleTile?.lines[0].segments[1].path).toContain("Q");
  });

  it("finds the nearest line through the spatial index and respects the hit tolerance", () => {
    const scene = buildNetworkGhostCanvasScene(
      [
        createLine("line:near", [createSegment("near", 0.1, 0.2, 0.8, 0.2)]),
        createLine("line:far", [createSegment("far", 0.1, 0.8, 0.8, 0.8)]),
      ],
      createSceneOptions(),
    );

    expect(hitTestNetworkGhostScene(scene, { x: 400, y: 183 }, 12)?.id).toBe("line:near");
    expect(hitTestNetworkGhostScene(scene, { x: 400, y: 260 }, 8)).toBeUndefined();
  });

  it("adapts the canvas DPR to the memory budget without dropping visible tiles", () => {
    const scene = buildNetworkGhostCanvasScene(createLoadProfile(33, 1_550), createSceneOptions());
    const memoryBudgetBytes = 32 * 1_024 * 1_024;
    const plan = createNetworkGhostTilePlan(scene, {
      zoom: 2,
      viewport: { x: 120, y: 80, width: 1_632, height: 860 },
      pixelRatio: 2,
      tileSize: 512,
      maxTiles: 16,
      memoryBudgetBytes,
    });

    expect(plan.tiles.length).toBeLessThanOrEqual(16);
    expect(plan.tiles.some((tile) => tile.priority === "visible")).toBe(true);
    expect(plan.memoryBytes).toBeLessThanOrEqual(memoryBudgetBytes);
    expect(plan.pixelRatio).toBeGreaterThanOrEqual(1);
    expect(plan.pixelRatio).toBeLessThanOrEqual(2);
  });

  it("evicts least-recently-used canvas bitmaps and closes their resources", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const closeC = vi.fn();
    const cache = new NetworkGhostTileLruCache(2, 18);

    cache.set("a", { close: closeA }, 8);
    cache.set("b", { close: closeB }, 8);
    cache.get("a");
    cache.set("c", { close: closeC }, 8);

    expect(cache.size).toBe(2);
    expect(cache.bytes).toBe(16);
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("b")).toBeUndefined();
    expect(closeB).toHaveBeenCalledOnce();

    cache.clear();
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeC).toHaveBeenCalledOnce();
    expect(cache.bytes).toBe(0);
  });
});

function createSceneOptions() {
  return {
    viewBoxWidth: 1080,
    viewBoxHeight: 620,
    paddingX: 78,
    paddingY: 68,
    zoom: 1,
  };
}

function createLoadProfile(lineCount: number, segmentCount: number): NetworkGhostLineView[] {
  const lines = Array.from({ length: lineCount }, (_, index) => createLine(`line:${index}`, []));

  for (let index = 0; index < segmentCount; index += 1) {
    const line = lines[index % lineCount];
    const column = index % 24;
    const row = Math.floor(index / 24) % 16;
    const fromX = 0.02 + column * 0.039;
    const fromY = 0.03 + row * 0.058;
    line.segments.push(
      createSegment(
        `${line.id}:segment:${index}`,
        fromX,
        fromY,
        Math.min(0.98, fromX + 0.035),
        Math.min(0.98, fromY + 0.042),
      ),
    );
  }

  return lines;
}

function createLine(
  id: string,
  segments: NetworkGhostLineView["segments"],
): NetworkGhostLineView {
  return {
    id,
    label: id,
    mode: "Bus",
    color: "#4b92db",
    textColor: "#ffffff",
    isBus: true,
    anchorStationId: `${id}:anchor`,
    anchorX: 0.5,
    anchorY: 0.5,
    stations: [],
    segments,
    geometrySource: "gtfs",
    geometryAttempts: [{ source: "gtfs", status: "success" }],
    loadOrder: 0,
  };
}

function createSegment(
  id: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): NetworkGhostLineView["segments"][number] {
  return {
    id,
    fromStationId: `${id}:from`,
    toStationId: `${id}:to`,
    fromX,
    fromY,
    toX,
    toY,
    polyline: [
      { x: fromX, y: fromY },
      { x: (fromX + toX) / 2, y: fromY + (toY - fromY) * 0.2 + 0.02 },
      { x: toX, y: toY },
    ],
    level: 0,
  };
}
