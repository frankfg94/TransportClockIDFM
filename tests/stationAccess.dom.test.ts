import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StationAccessOptimizerPage from "../src/features/line-optimizer/StationAccessOptimizerPage.vue";
import { ADDRESS_BOOK_STORAGE_KEY, resetAddressBookState } from "../src/features/address-book/addressBook";
import { DEFAULT_OPTIMIZER_SETTINGS, enumerateOptimizerCandidates, optimizerBaselineCourses } from "../src/features/line-optimizer/lineOptimizer";
import { optimizerItineraryCandidate } from "./fixtures/optimizerItinerary";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  ultimate: vi.fn(),
  geocode: vi.fn(),
  gpe: vi.fn(),
  catalogue: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("../src/features/line-optimizer/lineOptimizerProvider", () => ({
  createLineOptimizerProvider: () => ({
    createStationAccessSession: () => mocks.analyze,
    analyzeUltimateStationAccess: mocks.ultimate,
  }),
}));
vi.mock("../src/services/geocoding/ign", () => ({
  createIgnTransportMapGeocoder: () => ({ geocode: mocks.geocode }),
}));
vi.mock("../src/features/transport-map/gpeStationsApi", () => ({ fetchGpeStations: mocks.gpe }));
vi.mock("../src/features/transport-map/data/createTransportMapDataSource", () => ({
  TransportMapDataSource: class {
    ensureCatalog = mocks.catalogue;
    dispose = mocks.dispose;
  },
}));
vi.mock("../src/features/line-map/GlobalTransportPlanTravel.vue", () => ({
  __esModule: true,
  default: { name: "GlobalTransportPlanTravel", props: ["itinerary", "stationComparison"], template: "<div data-test='map' />" },
}));

const home = { id: "home", kind: "address", name: "Maison", address: "Châtenay-Malabry", lat: 48.765, lon: 2.26, isPrimary: true, icon: "home" };
const empty = { candidates: [], walkingRoutes: [], complete: false };
function ultimateResult(start: number, departureMinutes: number, rideMinutes: number) {
  const departure = start + (departureMinutes + 1) * 60_000;
  const transit = {
    type: "public_transport", lineCode: "194", lineId: "line:194", lineMode: "BUS" as const,
    departureDateTime: new Date(departure).toISOString(),
    arrivalDateTime: new Date(departure + rideMinutes * 60_000).toISOString(),
    durationSeconds: rideMinutes * 60,
  };
  const route = { id: "ultimate:test", durationSeconds: transit.durationSeconds, transitSections: [transit], sections: [transit] };
  const [candidate] = enumerateOptimizerCandidates(route, optimizerBaselineCourses(route),
    { ...DEFAULT_OPTIMIZER_SETTINGS, walkSeconds: undefined }, start, "station-access");
  return { candidate, complete: true };
}

let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  resetAddressBookState();
  localStorage.removeItem(ADDRESS_BOOK_STORAGE_KEY);
  mocks.geocode.mockResolvedValue([{ lat: home.lat, lon: home.lon, label: home.address }]);
  mocks.catalogue.mockResolvedValue({
    stations: [], entrances: [],
    lines: [{ id: "T10", mode: "TRAM", code: "C02317", label: "T10", stationIds: ["tram"] }],
  });
  mocks.gpe.mockResolvedValue([
    { id: "cm", line: "15", name: "Châtillon–Montrouge", lat: 48.785, lon: home.lon, projectStatus: "under-construction" },
    { id: "vg", line: "1514", name: "Villejuif–Gustave Roussy", lat: 48.8, lon: home.lon, projectStatus: "under-construction" },
    { id: "nc", line: "1516", name: "Noisy–Champs", lat: 48.91, lon: home.lon, projectStatus: "under-construction" },
  ]);
  mocks.analyze.mockResolvedValue(empty);
});
afterEach(() => { wrapper?.unmount(); resetAddressBookState(); });

describe("station access preset", () => {
  it("shows independent progress across both departure modes and starts the next queued station", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    mocks.gpe.mockResolvedValueOnce(Array.from({ length: 4 }, (_, index) => ({
      id: `station-${index}`, line: "15", name: `Gare ${index}`, lat: home.lat + (index + 1) / 100,
      lon: home.lon, projectStatus: "under-construction",
    })));
    const finish: Array<() => void> = [];
    mocks.analyze.mockImplementation(() => new Promise((resolve) => finish.push(() => resolve(empty))));
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.analyze).toHaveBeenCalledTimes(3);
    expect(wrapper.findAll(".station-access__station").filter((card) => card.text().includes("Calcul en cours"))).toHaveLength(3);
    expect(wrapper.findAll(".station-access__station").filter((card) => card.text().includes("Calcul en attente"))).toHaveLength(1);

    const cardProgress = () => wrapper!.findAll(".station-access__row footer [role='progressbar']")
      .map((bar) => bar.attributes("aria-valuenow"));
    expect(cardProgress()).toEqual(["0", "0", "0", "0"]);
    mocks.analyze.mock.calls[0]![0].onProgress(25);
    mocks.analyze.mock.calls[1]![0].onProgress(60);
    await flushPromises();
    expect(cardProgress()).toEqual(["25", "60", "0", "0"]);
    await wrapper.get('input[value="zeroWait"]').setValue(true);
    expect(cardProgress()).toEqual(["25", "60", "0", "0"]);
    expect(mocks.analyze).toHaveBeenCalledTimes(3);

    finish[1]!();
    await flushPromises();
    expect(mocks.analyze).toHaveBeenCalledTimes(4);
    expect(cardProgress()).toEqual(["25", "0", "0"]);
    finish.forEach((resolve) => resolve());
    await flushPromises();
    expect(wrapper.text()).toContain("4/4 stations analysées");
    expect(cardProgress()).toEqual([]);
  });

  it("refreshes automatically when the transfer limit changes and discards the old comparison", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    const finishUnrestricted: Array<() => void> = [];
    mocks.analyze.mockImplementation(({ maxTransfers }: { maxTransfers?: number }) => {
      if (maxTransfers !== undefined) return Promise.resolve(empty);
      return new Promise((resolve) => finishUnrestricted.push(() => resolve(empty)));
    });
    mocks.ultimate.mockImplementation(async ({ start }) => ultimateResult(start, 90, 15));
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    const limit = wrapper.get<HTMLSelectElement>("select");
    expect([...limit.element.options].map((option) => option.text)).toEqual(["Illimité", "3", "2", "1", "0 (direct seulement)"]);
    expect(limit.element.selectedIndex).toBe(0);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(finishUnrestricted).toHaveLength(2);

    await limit.setValue("1");
    await flushPromises();
    const [oldA, oldB, newA, newB] = mocks.analyze.mock.calls.map(([request]) => request);
    expect(oldA.maxTransfers).toBeUndefined();
    expect(oldA.signal.aborted && oldB.signal.aborted).toBe(true);
    expect([newA.maxTransfers, newB.maxTransfers]).toEqual([1, 1]);
    expect(newA.start).toBe(oldA.start);
    finishUnrestricted.forEach((finish) => finish());
    await flushPromises();
    expect(wrapper.text()).toContain("2/2 stations analysées");

    await wrapper.get('input[value="ultimate"]').setValue(true);
    await flushPromises();
    await limit.setValue("0");
    await flushPromises();
    expect(mocks.ultimate.mock.calls.map(([request]) => request.maxTransfers)).toEqual([1, 1, 0, 0]);
    await limit.setValue(limit.element.options[0]!.value);
    await flushPromises();
    expect(mocks.ultimate.mock.calls.slice(-2).map(([request]) => request.maxTransfers)).toEqual([undefined, undefined]);
  });

  it("compares the full day only when requested and keeps the result tied to the station", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    mocks.ultimate.mockImplementation(async ({ start }: { start: number }) => {
      await waiting;
      return ultimateResult(start, 9 * 60, 15);
    });
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get('input[type="time"]').setValue("06:00");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const stations = wrapper.findAll(".station-access__station");
    await stations[0]!.trigger("click");
    const selectUltimate = () => wrapper!.get(".station-access__details").findAll("button")
      .find((button) => button.text().startsWith("Trajet ultime"))!;
    expect(mocks.ultimate).not.toHaveBeenCalled();
    await selectUltimate().trigger("click");
    await flushPromises();
    const progress = wrapper.get(".station-access__ultimate [role='progressbar']");
    expect(progress.attributes("aria-valuenow")).toBe("0");
    expect(selectUltimate().attributes("disabled")).toBeDefined();
    mocks.ultimate.mock.lastCall![0].onProgress(35);
    await flushPromises();
    expect(progress.attributes("aria-valuenow")).toBe("35");
    finish();
    await flushPromises();
    expect(mocks.ultimate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      destination: expect.objectContaining({ label: "Châtillon–Montrouge" }),
    }));
    expect(wrapper.find(".station-access__ultimate [role='progressbar']").exists()).toBe(false);
    expect(wrapper.get(".station-access__details").text()).toContain("Partir à 15:00");
    expect(selectUltimate().attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-step-kind="transit"]').attributes("data-line-code")).toBe("194");
    await stations[1]!.trigger("click");
    expect(wrapper.get(".station-access__details").text()).not.toContain("Partir à 15:00");
    await stations[0]!.trigger("click");
    await selectUltimate().trigger("click");
    expect(wrapper.get(".station-access__details").text()).toContain("Partir à 15:00");
    expect(mocks.ultimate).toHaveBeenCalledTimes(1);
    await wrapper.get('input[type="time"]').setValue("07:00");
    expect(wrapper.find(".station-access__details").exists()).toBe(false);
  });

  it("runs Ultimate for every station, shows independent card progress and ranks by journey duration", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    const finish: Array<() => void> = [];
    mocks.ultimate.mockImplementation(({ start, destination }: { start: number; destination: { label: string } }) =>
      new Promise((resolve) => {
        const first = destination.label.startsWith("Châtillon");
        finish.push(() => resolve(ultimateResult(start, first ? 120 : 540, first ? 25 : 15)));
      }));

    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get('input[value="ultimate"]').setValue(true);
    await wrapper.get('input[type="time"]').setValue("06:00");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.ultimate).toHaveBeenCalledTimes(2);
    const cardBars = () => wrapper!.findAll(".station-access__row footer [role='progressbar']");
    expect(cardBars().map((bar) => bar.attributes("aria-valuenow"))).toEqual(["0", "0"]);
    mocks.ultimate.mock.calls[0]![0].onProgress(30);
    mocks.ultimate.mock.calls[1]![0].onProgress(65);
    await flushPromises();
    expect(cardBars().map((bar) => bar.attributes("aria-valuenow"))).toEqual(["30", "65"]);
    finish[1]!();
    await flushPromises();
    expect(cardBars().map((bar) => bar.attributes("aria-valuenow"))).toEqual(["30"]);
    expect(wrapper.get(".station-access__station strong").text()).toBe("Villejuif–Gustave Roussy");
    finish[0]!();
    await flushPromises();

    expect(cardBars()).toHaveLength(0);
    expect(wrapper.findAll(".station-access__station").map((card) => card.get("strong").text()))
      .toEqual(["Villejuif–Gustave Roussy", "Châtillon–Montrouge"]);
    expect(wrapper.get(".station-access__details").text()).toContain("Partir à 15:00");
    expect(wrapper.text()).not.toContain("Attendre le premier transport");
    const map = wrapper.getComponent({ name: "GlobalTransportPlanTravel" });
    expect(map.props("stationComparison")).toMatchObject({
      showNetwork: false, focusJourney: false, itineraries: expect.arrayContaining([
        expect.objectContaining({ itinerary: expect.objectContaining({ destination: expect.objectContaining({ label: "Châtillon–Montrouge" }) }) }),
        expect.objectContaining({ itinerary: expect.objectContaining({ destination: expect.objectContaining({ label: "Villejuif–Gustave Roussy" }) }) }),
      ]),
    });
    const networkToggle = wrapper.get(".station-access__map-tools button[aria-pressed]");
    await networkToggle.trigger("click");
    expect(map.props("stationComparison").showNetwork).toBe(true);
    expect(map.props("stationComparison").itineraries).toHaveLength(2);
    await wrapper.get(".station-access__station").trigger("click");
    expect(map.props("stationComparison").focusJourney).toBe(true);
  });

  it("starts Ultimate when switching modes and resumes only unfinished stations", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    let finishCancelled!: () => void;
    mocks.ultimate
      .mockImplementationOnce(async ({ start }) => ultimateResult(start, 90, 15))
      .mockImplementationOnce(({ start }) => new Promise((resolve) => {
        finishCancelled = () => resolve(ultimateResult(start, 120, 30));
      }))
      .mockImplementationOnce(async ({ start }) => ultimateResult(start, 180, 20));
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    await wrapper.get('input[value="ultimate"]').setValue(true);
    await flushPromises();
    expect(mocks.ultimate).toHaveBeenCalledTimes(2);

    const pending = mocks.ultimate.mock.calls[1]![0];
    await wrapper.get('input[value="zeroWait"]').setValue(true);
    expect(pending.signal.aborted).toBe(true);
    expect(wrapper.find(".station-access__row-progress").exists()).toBe(false);
    finishCancelled();
    await flushPromises();

    await wrapper.get('input[value="ultimate"]').setValue(true);
    await flushPromises();
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
    expect(mocks.ultimate).toHaveBeenCalledTimes(3);
    expect(mocks.ultimate.mock.lastCall?.[0]).toMatchObject({ destination: pending.destination, start: pending.start });
    expect(wrapper.text()).toContain("2/2 stations analysées");
  });

  it("starts at the primary Home and re-runs only a failed destination", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    mocks.analyze.mockRejectedValueOnce(new Error("temporary"));
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect((wrapper.get("#station-access-origin").element as HTMLInputElement).value).toBe(home.address);
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
    expect(mocks.analyze.mock.calls.every(([request]) => request.origin.id === home.id)).toBe(true);
    expect(wrapper.text()).toContain("2/2 stations analysées");
    expect(wrapper.text()).toContain("Futures gares du métro");
    expect(wrapper.text()).toContain("Gare fermée");
    expect(wrapper.text()).not.toContain("Noisy–Champs");
    await wrapper.get(".station-access__retry").trigger("click");
    await flushPromises();
    expect(mocks.analyze).toHaveBeenCalledTimes(3);
    expect(mocks.analyze.mock.lastCall?.[0]).toMatchObject({
      start: mocks.analyze.mock.calls[0]![0].start,
      destination: mocks.analyze.mock.calls[0]![0].destination,
    });
    expect(wrapper.find(".station-access__retry").exists()).toBe(false);
  });

  it("accepts a manual origin and discards late results after switching lines", async () => {
    mocks.analyze.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve(empty), { once: true });
    }));
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    const origin = wrapper.get<HTMLInputElement>("#station-access-origin");
    expect(origin.element.value).toBe("");
    await origin.setValue(home.address);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.geocode).toHaveBeenCalledWith(home.address, expect.any(AbortSignal));
    const input = wrapper.getComponent({ name: "LineCombobox" });
    input.vm.$emit("update:modelValue", { id: "T10" });
    await flushPromises();
    expect(mocks.analyze.mock.calls.every(([request]) => request.signal.aborted)).toBe(true);
    expect(input.props("modelValue")).toMatchObject({ label: "T10" });
    expect(wrapper.find(".station-access__results").exists()).toBe(false);
    expect((wrapper.get("#station-access-origin").element as HTMLInputElement).value).toBe(home.address);
  });

  it("accepts a typed address with the commune and no comma or postcode", async () => {
    const query = "277 avenue de la division leclerc chatenay malabry";
    const label = "277 Avenue de la Division Leclerc 92290 Châtenay-Malabry";
    mocks.geocode.mockResolvedValue([
      { lat: home.lat, lon: home.lon, label: "277 Avenue de la Division Leclerc 92160 Antony" },
      { lat: home.lat, lon: home.lon, label, postcode: "92290", city: "Châtenay-Malabry" },
    ]);
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get<HTMLInputElement>("#station-access-origin").setValue(query);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.geocode).toHaveBeenCalledWith(query, expect.any(AbortSignal));
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({ origin: expect.objectContaining({ label }) }));
    expect(wrapper.text()).not.toContain("Adresse de départ introuvable");
  });

  it("switches the cached journeys to Zero wait with a departure time and accessible help", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    mocks.analyze.mockImplementation(async ({ start }: { start: number }) => {
      const candidate = optimizerItineraryCandidate();
      const offset = start + 180_000 - candidate.leaveAt;
      const courses = candidate.courses.map((course) => ({
        ...course, departure: course.departure + offset, arrival: course.arrival + offset,
      }));
      return { ...empty, candidates: [{
        ...candidate, courses, leaveAt: candidate.leaveAt + offset, walkAt: candidate.walkAt + offset,
        arriveAt: candidate.arriveAt + offset,
      }] };
    });
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Attendre le premier transport");
    expect(wrapper.find(".station-access__departure-time").exists()).toBe(false);

    await wrapper.get('input[value="zeroWait"]').setValue(true);
    expect(wrapper.text()).toContain("Partir à");
    expect(wrapper.text()).not.toContain("Attendre le premier transport");
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
    const help = wrapper.get('button[aria-describedby="station-access-mode-tooltip"]');
    await help.trigger("click");
    expect(help.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get('[role="tooltip"]').text()).toContain("l’attente du premier transport");
  });

  it("shows another direct bus on the station card and allows selecting its itinerary", async () => {
    localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries: [home] }));
    mocks.analyze.mockImplementation(async ({ start }: { start: number }) => ({
      ...empty,
      candidates: ["294", "194", "195"].flatMap((lineCode, index) => {
        const transit = {
          type: "public_transport", lineCode, lineId: `line:${lineCode}`, lineMode: "BUS" as const,
          departureDateTime: new Date(start + 420_000).toISOString(),
          arrivalDateTime: new Date(start + 1_200_000 + index * 720_000).toISOString(),
          durationSeconds: 780 + index * 720,
        };
        const route = {
          id: lineCode, durationSeconds: transit.durationSeconds, transitSections: [transit],
          sections: [{ type: "street_network", mode: "walking", durationSeconds: 120 }, transit],
        };
        return enumerateOptimizerCandidates(
          route, optimizerBaselineCourses(route), { ...DEFAULT_OPTIMIZER_SETTINGS, walkSeconds: undefined },
          start, "station-access",
        );
      }),
    }));
    wrapper = mount(StationAccessOptimizerPage);
    await flushPromises();
    await wrapper.get('input[value="zeroWait"]').setValue(true);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const card = wrapper.get(".station-access__station");
    expect(card.text()).toContain("Aussi en direct");
    expect(card.find('[alt="Ligne 194"], [aria-label="Ligne 194"]').exists()).toBe(true);
    const alternatives = wrapper.get(".station-access__alternatives");
    const direct = alternatives.findAll("button").filter((button) => button.text().includes("Trajet direct"));
    expect(direct).toHaveLength(2);
    await direct[0]!.trigger("click");
    expect(direct.map((button) => button.attributes("aria-pressed"))).toEqual(["true", "false"]);
    expect(wrapper.get('[data-step-kind="transit"]').attributes("data-line-code")).toBe("194");
  });
});
