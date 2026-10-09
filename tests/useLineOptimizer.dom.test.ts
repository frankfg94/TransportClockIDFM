import { mount, flushPromises } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLineOptimizer } from "../src/features/line-optimizer/useLineOptimizer";
import { resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
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
const makePage = () =>
  mount(
    defineComponent({
      setup() {
        optimizer = useLineOptimizer(config);
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
});

describe("optimizer origin and request lifecycle", () => {
  it("starts from the saved Home coordinates and calculates walking for that address", async () => {
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
    expect(optimizer.originQuery.value).toBe("12 rue des Écoles");
    expect(optimizer.originPoint.value).toMatchObject({
      lon: 2.31,
      lat: 48.81,
      provider: "address-book",
    });
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.analyze.mock.calls[0]![0].origin).toMatchObject({ lon: 2.31, lat: 48.81 });
    expect(optimizer.settings.value.walkSeconds).toBeUndefined();
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
