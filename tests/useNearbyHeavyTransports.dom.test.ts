import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNearbyHeavyTransports, type NearbyHeavyTransportSource, type NearbyHeavyTransportResolverInput } from "../src/features/nearby-stations/useNearbyHeavyTransports";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";

afterEach(() => vi.restoreAllMocks());
function source(): NearbyHeavyTransportSource {
  const network: TransportMapNetwork = { lines: [], stations: [], entrances: [], regionalPaths: [], pathsById: new Map(),
    linesById: new Map(), stationsById: new Map(), bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
  return { origin: ref({ lon: 2.3, lat: 48.8 }), network: ref(network), stations: ref([]), activeModes: ref<GlobalMapMode[]>(["RER"]),
    radius: ref(600), stationsLoading: ref(true), futureProjectsReady: ref(false), futureProjects: ref([]) };
}
describe("heavy loading without display frames", () => {
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
