import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChaosLineSelection } from "../src/features/line-map/useChaosLineSelection";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import { createCamera } from "../src/features/transport-map/geo/camera";
describe("selection benchmark lifecycle", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  function setup(complete = true, intervalMs = 16, prepareDelayMs = 0) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), intervalMs));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    const restore = vi.fn(async () => {}), deselect = vi.fn();
    const immediateDeselects: boolean[] = [];
    const prepared = vi.fn();
    const prepare = vi.fn(async (assertActive: () => void) => {
      if (prepareDelayMs) await new Promise(resolve => setTimeout(resolve, prepareDelayMs));
      assertActive(); prepared();
    });
    const select = vi.fn(async (_line: GlobalMapLine, callback: () => void) => { if (complete) setTimeout(() => {
      const before = deselect.mock.calls.length; callback();
      immediateDeselects.push(deselect.mock.calls.length === before + 1);
    }, 80); });
    let benchmark!: ReturnType<typeof useChaosLineSelection>;
    const wrapper = mount(defineComponent({ setup() {
      benchmark = useChaosLineSelection({ isAvailable: () => true,
        getLines: () => ["a", "b"].map(id => ({ id, stationIds: ["station"] }) as GlobalMapLine),
        prepare, restore, select, deselect, cancelInteractions: vi.fn(),
        getCamera: () => createCamera(), getMetrics: () => undefined, getMetadata: () => ({}) });
      return () => null;
    } }));
    return { benchmark, wrapper, restore, select, deselect, immediateDeselects, prepared, prepare };
  }
  it("waits for actual completion, deselects immediately, and restores after 30 cycles", async () => {
    const { benchmark, wrapper, restore, select, deselect, immediateDeselects } = setup();
    const pending = benchmark.run();
    await vi.advanceTimersByTimeAsync(5000); await pending;
    expect(select).toHaveBeenCalledTimes(30);
    expect(deselect).toHaveBeenCalledTimes(31);
    expect(immediateDeselects).toEqual(Array(30).fill(true));
    expect(restore).toHaveBeenCalledOnce();
    expect(benchmark.running.value).toBe(false);
    expect(benchmark.report.value).toMatchObject({ status: "completed", completedOperationCount: 30 });
    const actions = benchmark.report.value!.actions as Array<{ deselectionDelayMs: number; selectionCallMs: number }>;
    expect(actions.every(action => action.deselectionDelayMs === 0)).toBe(true);
    wrapper.unmount();
  });
  it("interrupts a pending animation and restores without waiting for its timeout", async () => {
    const { benchmark, wrapper, restore, select } = setup(false);
    const pending = benchmark.run(); await vi.advanceTimersByTimeAsync(1200);
    expect(select).toHaveBeenCalledOnce(); benchmark.cancel(); await pending;
    expect(restore).toHaveBeenCalledOnce();
    expect(benchmark.report.value).toMatchObject({ status: "cancelled", completedOperationCount: 0 });
    expect(benchmark.report.value!.actions).toEqual([expect.objectContaining({ status: "interrupted", lineId: expect.any(String) })]);
    wrapper.unmount();
  });
  it("marks a throttled RAF cadence unreliable even if the document claims to be visible", async () => {
    const { benchmark, wrapper } = setup(true, 1000);
    const pending = benchmark.run(); await vi.advanceTimersByTimeAsync(100000); await pending;
    expect(benchmark.report.value).toMatchObject({ status: "completed", calibration: { cadenceReliable: false }, measurement: { foregroundComparable: false } });
    wrapper.unmount();
  });
  it("cancels preparation and prevents its delayed state change", async () => {
    const { benchmark, wrapper, prepared, restore, select } = setup(true, 16, 2000);
    const pending = benchmark.run(); await vi.advanceTimersByTimeAsync(100);
    benchmark.cancel(); await pending; await vi.advanceTimersByTimeAsync(2100);
    expect(prepared).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledOnce();
    expect(benchmark.report.value).toMatchObject({ status: "cancelled" }); wrapper.unmount();
  });
  it("preserves the existing selection if preparation fails before taking a snapshot", async () => {
    const { benchmark, wrapper, prepare, restore, deselect } = setup();
    prepare.mockRejectedValueOnce(new Error("catalog-unavailable"));
    await benchmark.run();
    expect(deselect).not.toHaveBeenCalled(); expect(restore).toHaveBeenCalledOnce();
    expect(benchmark.report.value).toMatchObject({ status: "failed", error: "catalog-unavailable" });
    wrapper.unmount();
  });
  it("reports missing completion as failure, then restores", async () => {
    const { benchmark, wrapper, restore } = setup(false);
    const pending = benchmark.run(); await vi.advanceTimersByTimeAsync(17000); await pending;
    expect(benchmark.report.value).toMatchObject({ status: "failed", error: "animation-timeout" });
    expect(restore).toHaveBeenCalledOnce(); wrapper.unmount();
  });
});
