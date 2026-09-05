import { describe, expect, it } from "vitest";
import { BoundedLruCache } from "../src/features/transport-map/data/decodedChunkCache";
import { createWorkerRequest, isCurrentGeneration, transferableBuffers } from "../src/features/transport-map/workers/protocol";
import { createInertiaState, MAX_INERTIA_SPEED_PX_PER_MS, startInertia, stepInertia } from "../src/features/transport-map/interaction/inertia";

describe("global transport bounded runtime primitives", () => {
  it("evicts decoded chunks by both entry count and bytes", () => {
    const disposed: string[] = [];
    const cache = new BoundedLruCache<string>(2, 12);
    cache.set("a", { value: "a", bytes: 6, dispose: (value) => disposed.push(value) });
    cache.set("b", { value: "b", bytes: 4, dispose: (value) => disposed.push(value) });
    expect(cache.get("a")).toBe("a");
    cache.set("c", { value: "c", bytes: 6 });
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.metrics().bytes).toBe(12);
    expect(disposed).toEqual(["b"]);
  });

  it("keeps worker generations and transferable buffers explicit", () => {
    const request = createWorkerRequest("identity", { data: new Float32Array([1, 2]) }, 4);
    expect(request.schemaVersion).toBe(1);
    expect(isCurrentGeneration({ generation: 4 }, 4)).toBe(true);
    expect(isCurrentGeneration({ generation: 3 }, 4)).toBe(false);
    expect(transferableBuffers(request.payload).length).toBe(1);
  });

  it("decays pan inertia without crossing into an unbounded loop", () => {
    let state = startInertia(createInertiaState(), 0.8, -0.4);
    let distance = 0;
    for (let index = 0; index < 500 && state.active; index += 1) {
      const step = stepInertia(state, 16);
      state = step.state;
      distance += Math.hypot(step.deltaX, step.deltaY);
    }
    expect(state.active).toBe(false);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(10_000);
  });

  it("caps a sparse pointer sample before it can catapult the camera", () => {
    const state = startInertia(createInertiaState(), 40, -30);
    expect(Math.hypot(state.velocityX, state.velocityY)).toBeCloseTo(MAX_INERTIA_SPEED_PX_PER_MS, 10);
    expect(Math.hypot(state.velocityX, state.velocityY)).toBeLessThanOrEqual(MAX_INERTIA_SPEED_PX_PER_MS);
  });
});
