import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { UserGeolocationCoordinates } from "../src/services/userGeolocationRuntime";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(), refresh: vi.fn(), scan: vi.fn(), routes: vi.fn(), stations: vi.fn(), directions: vi.fn(), departures: vi.fn(),
}));
const coordinates = ref<UserGeolocationCoordinates>();
const authorized = ref(false);
const permission = ref("prompt");
const stations = ref<any[]>([]);
const scanError = ref();
vi.mock("../src/composables/useUserGeolocation", () => ({
  useUserGeolocation: () => ({ coordinates, isAuthorized: authorized, permissionState: permission,
    isStale: ref(false), isLoading: ref(false), askGeolocation: mocks.ask, refresh: mocks.refresh }),
}));
vi.mock("../src/features/nearby-stations/useNearbyStations", () => ({
  useNearbyStations: () => ({ radius: ref(0), clusterGroupingDistanceMeters: ref(0), stations,
    error: scanError, selectPlace: mocks.scan }),
}));
vi.mock("../src/services/nearbyWalkingRoutes", () => ({ getNearbyWalkingRouteMatrix: mocks.routes }));
vi.mock("../src/services/idfm", () => ({ searchLineStations: mocks.stations, fetchDirectionGroupsForStation: mocks.directions, fetchBoardDepartures: mocks.departures }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import AutoDashboard from "../src/features/auto-dashboard/AutoDashboard.vue";

function position(lat: number): UserGeolocationCoordinates {
  return { latitude: lat, longitude: 2, accuracy: 10, timestamp: Date.now(), altitude: null,
    altitudeAccuracy: null, heading: null, speed: null };
}
function entry(id: string, lat: number) {
  return { lines: [{ id: `line-${id}`, mode: "BUS", code: id, label: id, color: "#000", textColor: "#fff" }],
    memberStations: [{ id, lat, lon: 2, name: id, rawRefs: ["station:FR::Quay:50221140:FR1"], lineIds: [`line-${id}`] }] };
}
function route(id: string, seconds = 300) {
  return { id, durationSeconds: seconds, distanceMeters: 200, provider: "openrouteservice", coordinates: [{ lat: 48, lon: 2 }, { lat: 48.001, lon: 2 }] };
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
}
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  vi.clearAllMocks();
  coordinates.value = undefined;
  authorized.value = false;
  permission.value = "granted";
  scanError.value = undefined;
  stations.value = [entry("a", 48.001)];
  mocks.ask.mockImplementation(async () => { permission.value = "granted"; authorized.value = true; coordinates.value = position(48); return true; });
  mocks.scan.mockResolvedValue(undefined);
  mocks.routes.mockImplementation(async (_origin, destinations) => destinations.map((destination: { id: string }) => route(destination.id)));
  mocks.stations.mockImplementation(async (line: { id: string }) => stations.value
    .flatMap((station) => station.memberStations)
    .filter((station) => station.lineIds.includes(line.id))
    .map((station) => ({
      label: station.name, lat: station.lat, lon: station.lon,
      id: `stop_area:IDFM:${station.id}`,
      monitoringRef: `STIF:StopArea:SP:${station.id}:`,
      scheduleStopAreaRef: `stop_area:IDFM:${station.id}`,
    })));
  mocks.directions.mockResolvedValue([]);
  mocks.departures.mockResolvedValue({ departures: [], directionGroups: [] });
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); });

describe("AUTO dashboard", () => {
  it("activates location, creates a card at the inclusive limit and offers a manual return", async () => {
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle();
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(mocks.ask).toHaveBeenCalledOnce();
    expect(mocks.routes).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "preferred", { persistentCache: false });
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    expect(mocks.departures).toHaveBeenCalledWith(expect.objectContaining({
      line: expect.objectContaining({ ref: "STIF:Line::line-a:" }),
      schedule: { lineRef: "line-a", stopAreaRef: "stop_area:IDFM:a" },
      monitoringPoints: [expect.objectContaining({ ref: "STIF:StopArea:SP:a:" })],
    }), expect.anything());
    expect(wrapper.text()).toContain("autoDashboard.walkingDistance");
    await wrapper.findAll("button").at(-1)!.trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
  });

  it("waits for a tap before requesting browser permission", async () => {
    permission.value = "prompt";
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle();
    expect(mocks.ask).not.toHaveBeenCalled();
    await wrapper.get(".auto-dashboard__status button").trigger("click");
    expect(mocks.ask).toHaveBeenCalledOnce();
  });

  it("shows denial, clears cards on revocation and cancels work on unmount", async () => {
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle(); await vi.advanceTimersByTimeAsync(1); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    permission.value = "denied"; authorized.value = false;
    await nextTick();
    expect(wrapper.text()).toContain("autoDashboard.denied");
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(0);
    wrapper.unmount(); wrapper = undefined;
    const calls = mocks.scan.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.scan).toHaveBeenCalledTimes(calls);
  });

  it("ignores an older route result after a significant movement", async () => {
    let resolveOld!: (routes: unknown[]) => void;
    mocks.routes.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle(); await vi.advanceTimersByTimeAsync(1); await settle();
    expect(mocks.routes).toHaveBeenCalledTimes(1);
    stations.value = [entry("b", 48.011)];
    coordinates.value = position(48.01);
    await nextTick();
    await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(mocks.routes).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    resolveOld([route("a")]); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    expect((wrapper.findComponent({ name: "TransitBoard" }).props("board") as { title: string }).title).toBe("b");
  });

  it("requires two successive out-of-range observations before removing a card", async () => {
    let duration = 300;
    mocks.routes.mockImplementation(async (_origin, destinations) => destinations.map((destination: { id: string }) => route(destination.id, duration)));
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle(); await vi.advanceTimersByTimeAsync(1); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    duration = 301;
    coordinates.value = position(48.001);
    await nextTick(); await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    coordinates.value = position(48.0011);
    await nextTick(); await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(0);
  });

  it("confirms a boundary when the device emits no additional stationary fix", async () => {
    let duration = 300;
    mocks.routes.mockImplementation(async (_origin, destinations) => destinations.map((destination: { id: string }) => route(destination.id, duration)));
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle(); await vi.advanceTimersByTimeAsync(1); await settle();
    duration = 301;
    coordinates.value = position(48.001);
    await nextTick(); await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(0);
  });

  it("keeps a stop briefly when it leaves the geographic scan, then removes it", async () => {
    wrapper = mount(AutoDashboard, { global: { stubs: { TransitBoard: true } } });
    await settle(); await vi.advanceTimersByTimeAsync(1); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    stations.value = [];
    coordinates.value = position(48.02);
    await nextTick(); await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000); await settle();
    expect(wrapper.findAll("transit-board-stub")).toHaveLength(0);
  });
});
