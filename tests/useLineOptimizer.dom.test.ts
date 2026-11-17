import { mount, flushPromises } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLineOptimizer } from "../src/features/line-optimizer/useLineOptimizer";
import { velizyOptimizerConfig, resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import type { AddressBookEntry } from "../src/features/address-book/addressBook";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  geocode: vi.fn(),
  station: vi.fn(),
  home: undefined as AddressBookEntry | undefined,
}));
vi.mock("../src/features/line-optimizer/lineOptimizerProvider", () => ({
  createLineOptimizerProvider: () => ({ analyze: mocks.analyze }),
}));
vi.mock("../src/services/geocoding/ign", () => ({
  createIgnTransportMapGeocoder: () => ({ geocode: mocks.geocode }),
}));
vi.mock("../src/services/idfm", () => ({ searchNavitiaDestinationPoints: mocks.station }));
vi.mock("../src/features/address-book/addressBook", () => ({
  useAddressBook: () => ({
    primaryAddress: computed(() => mocks.home),
    entries: ref(mocks.home ? [mocks.home] : []),
  }),
  toAddressBookPoint: (entry: AddressBookEntry) => ({
    id: entry.id,
    lon: entry.lon,
    lat: entry.lat,
    label: entry.address || entry.name,
    provider: "address-book",
  }),
}));
const config = resolveLineOptimizerConfig("tram", "T10")!;
const result = { candidates: [], complete: false, analyzedAt: Date.now(), courseCount: 0 };
let wrapper: ReturnType<typeof mount> | undefined;
let optimizer: ReturnType<typeof useLineOptimizer>;
const makePage = (pageConfig = config) =>
  mount(
    defineComponent({
      setup() {
        optimizer = useLineOptimizer(pageConfig);
        return () => h("div", optimizer.status.value);
      },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.home = undefined;
  mocks.analyze.mockResolvedValue({ ...result });
  mocks.geocode.mockResolvedValue([{ lon: 2.27, lat: 48.77, label: config.defaultOrigin }]);
  mocks.station.mockResolvedValue([
    { id: "stop_area:chatelet", label: "Châtelet - Les Halles (Paris)", lon: 2.35, lat: 48.86 },
  ]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("optimizer origin and request lifecycle", () => {
  it("keeps the configured default origin even when a primary Home address exists", async () => {
    mocks.home = {
      id: "home",
      kind: "address",
      name: "Home",
      address: "12 rue des Écoles",
      lon: 2.31,
      lat: 48.81,
      icon: "home",
      isPrimary: true,
    };
    wrapper = makePage();
    await flushPromises();
    expect(optimizer.originQuery.value).toBe(config.defaultOrigin);
    expect(mocks.geocode).toHaveBeenCalledWith(config.defaultOrigin, expect.any(AbortSignal));
    expect(mocks.analyze.mock.calls[0]![0].origin).toMatchObject({ lon: 2.27, lat: 48.77 });
    expect(optimizer.settings.value.walkSeconds).toBe(90);
  });
  it("keeps the requested 90-second walk for the default origin and uses calculated walking for other favorites", async () => {
    wrapper = makePage();
    await flushPromises();
    expect(optimizer.settings.value.walkSeconds).toBe(90);
    const favorite: AddressBookEntry = {
      id: "favorite",
      kind: "address",
      name: "Chez un ami",
      address: "Rue voisine",
      lon: 2.26,
      lat: 48.78,
      icon: "star",
    };
    optimizer.selectAddress(favorite, "origin");
    await flushPromises();
    expect(mocks.geocode).toHaveBeenCalledOnce();
    expect(mocks.analyze.mock.lastCall?.[0].origin).toMatchObject({ lon: 2.26, lat: 48.78 });
    expect(optimizer.settings.value.walkSeconds).toBeUndefined();
  });
  it("aborts and discards a calculation when the origin changes", async () => {
    let complete!: (value: typeof result) => void;
    mocks.analyze.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    wrapper = makePage();
    await flushPromises();
    const signal = mocks.analyze.mock.calls[0]![0].signal as AbortSignal;
    optimizer.originQuery.value = "Une autre adresse";
    expect(signal.aborted).toBe(true);
    complete(result);
    await flushPromises();
    expect(optimizer.status.value).toBe("idle");
    expect(optimizer.result.value).toBeUndefined();
  });
});


it("does not route to an unrelated geocoder result for a numbered destination", async () => {
  mocks.station.mockResolvedValue([]);
  mocks.geocode.mockImplementation(async (query: string) => query === config.defaultOrigin
    ? [{ lon: 2.27, lat: 48.77, label: config.defaultOrigin }]
    : [{ lon: 2.18, lat: 48.78, label: "1 Avenue du Capitaine Tarron 78140 Vélizy-Villacoublay" }]);
  wrapper = makePage(velizyOptimizerConfig);
  await flushPromises();
  expect(mocks.analyze).not.toHaveBeenCalled();
  expect(optimizer.status.value).toBe("error");
  expect(optimizer.destinationPoint.value).toBeUndefined();
});


it("routes to the confirmed Meudon destination", async () => {
  mocks.station.mockResolvedValue([]);
  mocks.geocode.mockImplementation(async (query: string) => query === config.defaultOrigin
    ? [{ lon: 2.27, lat: 48.77, label: config.defaultOrigin }]
    : [{ lon: 2.210006, lat: 48.787995, label: "1 Avenue du Maréchal Juin 92360 Meudon" }]);
  wrapper = makePage(velizyOptimizerConfig);
  await flushPromises();
  expect(optimizer.settings.value.minimizeBusTransfers).toBe(true);
  expect(optimizer.settings.value.limitConnections).toBe(true);
  expect(optimizer.destinationQuery.value).toBe("1 avenue du Maréchal Juin, 92360 Meudon");
  expect(mocks.analyze.mock.calls[0]![0].destination).toMatchObject({ lon: 2.210006, lat: 48.787995 });
});


it("keeps the previous reachable recommendation while refreshing and on failure, but clears it when the destination changes", async () => {
  const candidate = { leaveAt: Date.now() + 600_000 };
  const previous = { ...result, candidates: [candidate] };
  mocks.analyze.mockResolvedValueOnce(previous);
  wrapper = makePage();
  await flushPromises();
  expect(optimizer.winner.value).toBe(candidate);
  let fail!: (reason: Error) => void;
  mocks.analyze.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const pending = optimizer.refresh();
  await flushPromises();
  expect(optimizer.status.value).toBe("loading");
  expect(optimizer.winner.value).toBe(candidate);
  fail(new Error("offline"));
  await pending;
  expect(optimizer.status.value).toBe("error");
  expect(optimizer.winner.value).toBe(candidate);
  optimizer.destinationQuery.value = "Une autre destination";
  expect(optimizer.result.value).toBeUndefined();
});


it("freezes a Paris simulation across clock ticks and returns to live time when cleared", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T14:00:00Z")); // 15:00 in Paris
  wrapper = makePage();
  await vi.advanceTimersByTimeAsync(0);
  const liveStart = mocks.analyze.mock.calls[0]![0].start;
  expect(liveStart).toBe(Date.parse("2026-11-15T14:00:00Z"));

  optimizer.simulationTime.value = "08:30";
  const start = Date.parse("2026-11-15T07:30:00Z");
  const candidate = { leaveAt: start + 300_000 };
  mocks.analyze.mockResolvedValueOnce({ ...result, candidates: [candidate], complete: true });
  await optimizer.refresh();
  expect(mocks.analyze.mock.lastCall?.[0].start).toBe(start);
  expect(optimizer.now.value).toBe(start);
  expect(optimizer.winner.value).toBe(candidate);
  const calls = mocks.analyze.mock.calls.length;
  await vi.advanceTimersByTimeAsync(31_000);
  expect(optimizer.now.value).toBe(start);
  expect(optimizer.winner.value).toBe(candidate);
  expect(mocks.analyze).toHaveBeenCalledTimes(calls);

  optimizer.simulationTime.value = "";
  expect(optimizer.result.value).toBeUndefined();
  await optimizer.refresh();
  expect(mocks.analyze.mock.lastCall?.[0].start).toBe(Date.parse("2026-11-15T14:00:31Z"));
});

it("rejects a nonexistent Paris daylight-saving time", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));
  wrapper = makePage();
  await vi.advanceTimersByTimeAsync(0);
  const calls = mocks.analyze.mock.calls.length;
  optimizer.simulationTime.value = "02:30";
  await optimizer.refresh();
  expect(optimizer.status.value).toBe("error");
  expect(optimizer.errorPhase.value).toBe("simulation");
  expect(mocks.analyze).toHaveBeenCalledTimes(calls);
});


it("uses the current Paris date even when UTC is on the previous day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T23:30:00Z"));
  wrapper = makePage();
  await vi.advanceTimersByTimeAsync(0);
  optimizer.simulationTime.value = "08:30";
  await optimizer.refresh();
  expect(mocks.analyze.mock.lastCall?.[0].start).toBe(Date.parse("2026-11-15T07:30:00Z"));
});
