import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNearbyHeavyTransports, type NearbyHeavyTransportSource, type NearbyHeavyTransportResolverInput } from "../src/features/nearby-stations/useNearbyHeavyTransports";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { verdictDebugTimeline } from "../src/services/verdictDebugTimeline";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";

afterEach(() => vi.restoreAllMocks());
function source(): NearbyHeavyTransportSource {
  const network: TransportMapNetwork = { lines: [], stations: [], entrances: [], regionalPaths: [], pathsById: new Map(),
    linesById: new Map(), stationsById: new Map(), bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
  return { origin: ref({ lon: 2.3, lat: 48.8 }), network: ref(network), stations: ref([]), activeModes: ref<GlobalMapMode[]>(["RER"]),
    radius: ref(600), stationsLoading: ref(true), futureProjectsReady: ref(false), futureProjects: ref([]) };
}
describe("heavy loading without display frames", () => {
  it("announces the target total and publishes a preview every 30 completed searches", async () => {
    const input = source();
    input.stationsLoading!.value = false;
    input.futureProjectsReady!.value = true;
    let active!: NearbyHeavyTransportResolverInput;
    let finish!: (candidates: NearbyHeavyTransportCandidate[]) => void;
    const final = new Promise<NearbyHeavyTransportCandidate[]>(resolve => { finish = resolve; });
    const resolve = (options: NearbyHeavyTransportResolverInput) => {
      active = options;
      options.onTargetsProgress!(0, 60);
      return final;
    };
    let heavy!: ReturnType<typeof useNearbyHeavyTransports>;
    const wrapper = mount(defineComponent({ setup() {
      heavy = useNearbyHeavyTransports(input, { resolver: { resolve }, trackProgress: true });
      return () => null;
    } }));
    try {
      await flushPromises();
      expect(heavy.targetProgress.value).toEqual({ completed: 0, total: 60 });
      const candidate = { id: "fixture-station" } as NearbyHeavyTransportCandidate;
      active.onAccessResolved!(candidate);
      active.onTargetsProgress!(29, 60);
      expect(heavy.previewCandidates.value).toBeUndefined();
      active.onTargetsProgress!(30, 60);
      expect(heavy.previewCandidates.value).toEqual([candidate]);
      expect(heavy.visibleCandidates.value).toEqual([]);
      finish([candidate]);
      await heavy.whenSettled();
      expect(heavy.previewCandidates.value).toBeUndefined();
      expect(heavy.visibleCandidates.value).toEqual([candidate]);
    } finally {
      finish([]);
      wrapper.unmount();
    }
  });
  it.each([false, true])("ends stalled access probes at the search deadline and allows a retry (batched: %s)", async (batchQueries) => {
    vi.useFakeTimers();
    const input = source();
    input.stationsLoading!.value = false;
    input.futureProjectsReady!.value = true;
    const findJourneys = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue([]);
    const resolve = async ({ journeyProvider, signal, origin }: NearbyHeavyTransportResolverInput) => {
      await journeyProvider.findJourneys({ origin, destination: { ...origin, id: "test" } }, signal).catch(() => []);
      return [];
    };
    let heavy!: ReturnType<typeof useNearbyHeavyTransports>;
    const wrapper = mount(defineComponent({ setup() {
      heavy = useNearbyHeavyTransports(input, { journeyProvider: { findJourneys }, resolver: { resolve }, batchQueries, partialResultsTimeoutMs: 45_000 });
      return () => null;
    } }));
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(heavy.isLoading.value).toBe(true);
      await vi.advanceTimersByTimeAsync(45_000);
      expect(heavy.isLoading.value).toBe(false);
      expect(heavy.error.value).toMatch(/timed out/);
      expect(findJourneys.mock.calls[0]?.[1].aborted).toBe(true);
      await heavy.retryFailed();
      expect(findJourneys).toHaveBeenCalledTimes(2);
      expect(heavy.error.value).toBeUndefined();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it("finishes a progressing search even when its total duration exceeds the idle timeout", async () => {
    vi.useFakeTimers();
    const input = source();
    input.stationsLoading!.value = false;
    input.futureProjectsReady!.value = true;
    let heavy!: ReturnType<typeof useNearbyHeavyTransports>;
    const resolve = async (run: NearbyHeavyTransportResolverInput) => {
      run.onTargetsProgress!(0, 3);
      for (let i = 1; i <= 3; i++) {
        await new Promise<void>(done => setTimeout(done, 30_000));
        run.partialResultsDeadline?.throwIfAborted();
        run.onTargetsProgress!(i, 3);
      }
      return [];
    };
    const wrapper = mount(defineComponent({ setup() {
      heavy = useNearbyHeavyTransports(input, { resolver: { resolve }, partialResultsIdleTimeoutMs: 45_000 });
      return () => null;
    } }));
    try {
      await vi.advanceTimersByTimeAsync(90_000);
      await heavy.whenSettled();
      expect(heavy.error.value).toBeUndefined();
      expect(heavy.isLoading.value).toBe(false);
    } finally { wrapper.unmount(); vi.useRealTimers(); }
  });
  it("retries an early failure after the current group finishes, even on two clicks", async () => {
    const input = source();
    input.stationsLoading!.value = false;
    input.futureProjectsReady!.value = true;
    let finish!: () => void;
    const currentGroup = new Promise<void>(resolve => { finish = resolve; });
    const findJourneys = vi.fn().mockRejectedValueOnce(new Error("GTFS unavailable")).mockResolvedValue([]);
    const resolve = vi.fn(async ({ journeyProvider, signal, origin }: NearbyHeavyTransportResolverInput) => {
      await journeyProvider.findJourneys({ origin, destination: { ...origin, id: "test" } }, signal).catch(() => []);
      await currentGroup;
      return [];
    });
    let heavy!: ReturnType<typeof useNearbyHeavyTransports>;
    const wrapper = mount(defineComponent({ setup() {
      heavy = useNearbyHeavyTransports(input, { journeyProvider: { findJourneys }, resolver: { resolve }, batchQueries: true });
      return () => null;
    } }));
    try {
      await vi.waitFor(() => expect(heavy.error.value).toBe("GTFS unavailable"));
      expect(heavy.isLoading.value).toBe(true);
      const retries = Promise.all([heavy.retryFailed(), heavy.retryFailed()]);
      expect(resolve).toHaveBeenCalledTimes(1);
      finish();
      await retries;
      expect(resolve).toHaveBeenCalledTimes(2);
      expect(heavy.error.value).toBeUndefined();
      expect(heavy.isLoading.value).toBe(false);
    } finally { finish(); wrapper.unmount(); }
  });
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
  it("reuses the active search for equivalent inputs and reacts to a radius change", async () => {
    const input = source();
    input.stationsLoading!.value = false;
    input.futureProjectsReady!.value = true;
    const resolve = vi.fn(async () => []);
    const wrapper = mount(defineComponent({ setup() { useNearbyHeavyTransports(input, { resolver: { resolve } }); return () => null; } }));
    try {
      await flushPromises();
      input.stations.value = [];
      input.futureProjects!.value = [];
      await flushPromises();
      expect(resolve).toHaveBeenCalledTimes(1);
      input.radius.value += 100;
      await flushPromises();
      expect(resolve).toHaveBeenCalledTimes(2);
    } finally { wrapper.unmount(); }
  });
});
