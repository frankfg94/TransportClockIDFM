import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNearbyHeavyTransports, type NearbyHeavyTransportSource, type NearbyHeavyTransportResolverInput } from "../src/features/nearby-stations/useNearbyHeavyTransports";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { verdictDebugTimeline } from "../src/services/verdictDebugTimeline";

afterEach(() => vi.restoreAllMocks());
function source(): NearbyHeavyTransportSource {
  const network: TransportMapNetwork = { lines: [], stations: [], entrances: [], regionalPaths: [], pathsById: new Map(),
    linesById: new Map(), stationsById: new Map(), bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
  return { origin: ref({ lon: 2.3, lat: 48.8 }), network: ref(network), stations: ref([]), activeModes: ref<GlobalMapMode[]>(["RER"]),
    radius: ref(600), stationsLoading: ref(true), futureProjectsReady: ref(false), futureProjects: ref([]) };
}
describe("heavy loading without display frames", () => {
  it("labels initial and manual/visibility/periodic refreshes without changing their work", async () => {
    vi.useFakeTimers();
    const previousUrl = window.location.href;
    window.history.replaceState({}, "", "/?debugVerdict=1");
    verdictDebugTimeline.clear();
    const input = source(), resolve = vi.fn(async (_input: NearbyHeavyTransportResolverInput) => []);
    input.stationsLoading!.value = false; input.futureProjectsReady!.value = true;
    let heavy!: ReturnType<typeof useNearbyHeavyTransports>;
    const wrapper = mount(defineComponent({ setup() { heavy = useNearbyHeavyTransports(input, { resolver: { resolve } }); return () => null; } }));
    try {
      await flushPromises();
      await heavy.refresh();
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange")); await flushPromises();
      await vi.advanceTimersByTimeAsync(5 * 60_000); await flushPromises();
      expect(verdictDebugTimeline.tasks.value.filter(t => t.system === "heavy-transports").map(t => [t.details?.phase, t.details?.reason]))
        .toEqual([["initial", "inputs"], ["refresh", "manual"], ["refresh", "visibility"], ["refresh", "interval"]]);
      expect(resolve).toHaveBeenCalledTimes(4);
    } finally {
      wrapper.unmount(); window.history.replaceState({}, "", previousUrl);
      delete (document as unknown as { visibilityState?: string }).visibilityState;
      verdictDebugTimeline.clear(); vi.useRealTimers();
    }
  });
  it("coalesces readiness changes and starts with suspended animation frames", async () => {
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 123);
    const input = source(), resolve = vi.fn(async (_input: NearbyHeavyTransportResolverInput) => []);
    const wrapper = mount(defineComponent({ setup() { useNearbyHeavyTransports(input, { resolver: { resolve } }); return () => null; } }));
    await flushPromises(); expect(resolve).not.toHaveBeenCalled();
    input.stationsLoading!.value = false; input.futureProjectsReady!.value = true; input.radius.value = 800;
    await flushPromises();
    expect(resolve).toHaveBeenCalledTimes(1); expect(resolve.mock.calls[0]![0].radiusMeters).toBe(800);
    expect(frame).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it("does not start queued loading after unmount", async () => {
    const input = source(), resolve = vi.fn(async (_input: NearbyHeavyTransportResolverInput) => []);
    input.stationsLoading!.value = false; input.futureProjectsReady!.value = true;
    const wrapper = mount(defineComponent({ setup() { useNearbyHeavyTransports(input, { resolver: { resolve } }); return () => null; } }));
    wrapper.unmount(); await flushPromises(); expect(resolve).not.toHaveBeenCalled();
  });
});
