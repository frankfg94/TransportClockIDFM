import { defineComponent, computed, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Panel from "../src/features/nearby-stations/VerdictPersonalJourneys.vue";
import { useVerdictPersonalJourneys, type VerdictPersonalJourneys } from "../src/features/nearby-stations/useVerdictPersonalJourneys";
import { useAppSettings, createDefaultAppSettings } from "../src/features/app-settings/appSettings";
import { useAddressBook, resetAddressBookState, ADDRESS_BOOK_STORAGE_KEY, type AddressBookEntry } from "../src/features/address-book/addressBook";
import type { NearbyJourney, TravelRoutesProvider } from "../src/features/nearby-stations/nearbyHeavyTransports";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood";

const home: AddressBookEntry = { id: "home", kind: "address", name: "Domicile test", lat: 48.8, lon: 2.2, icon: "home", isPrimary: true };
const work: AddressBookEntry = { id: "work", kind: "address", name: "Bureau test", lat: 48.85, lon: 2.3, icon: "work", isWorkplace: true };
const friend: AddressBookEntry = { id: "friend", kind: "address", name: "Amis test", lat: 48.9, lon: 2.4, icon: "star" };
const journey: NearbyJourney = { source: "gtfs", durationSeconds: 2700, sections: [{ type: "public_transport", mode: "METRO", lineCode: "4", durationSeconds: 2700 }] };
let wrapper: VueWrapper | undefined;
let api: VerdictPersonalJourneys;
let app: ReturnType<typeof useAppSettings>;
const findJourneys = vi.fn<TravelRoutesProvider["findJourneys"]>(async () => [journey]);
const origin = ref({ label: "Verdict test", lat: 48.7, lon: 2.1 });
const datetime = ref("20261023T090000");
function boot(entries: AddressBookEntry[], stubGeocoder = false) {
  window.localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  wrapper = mount(defineComponent({ components: { Panel }, setup() {
    app = useAppSettings();
    api = useVerdictPersonalJourneys({ origin, datetime, provider: { findJourneys } });
    const score = computed(() => buildNeighborhoodScore({ places: [], placesLoaded: false, stations: [], stationsLoaded: true, personalJourneys: api.rows.value }).displayScore);
    return { api, score };
  }, template: '<div><output>{{ score }}</output><Panel :journeys="api" /></div>' }), { attachTo: document.body, global: { stubs: { Teleport: true,
    ...(stubGeocoder ? { GlobalMapMarkerAddressField: defineComponent({ setup(_, { expose }) { expose({ resolveAddress: async () => ({ lon: friend.lon, lat: friend.lat, label: "Adresse résolue de test" }) }); }, template: '<div />' }) } : {}),
  } } });
}
beforeEach(() => {
  window.localStorage.clear(); resetAddressBookState();
  findJourneys.mockReset().mockResolvedValue([journey]);
  origin.value = { label: "Verdict test", lat: 48.7, lon: 2.1 };
  datetime.value = "20261023T090000";
  // useState is intentionally shared by the Nuxt test adapter.
  mount(defineComponent({ setup() { app = useAppSettings(); app.settings.value = createDefaultAppSettings(); app.storageError.value = false; }, template: '<div />' })).unmount();
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; resetAddressBookState(); document.body.innerHTML = ""; });

describe("Verdict personal journeys workflow", () => {
  it("creates a new address through the directory form before adding the journey", async () => {
    boot([], true); await flushPromises();
    await wrapper!.get('[data-testid="personal-journey-add"]').trigger("click");
    const add = wrapper!.findAll("button").find(button => button.text().includes("Ajouter une entrée"))!;
    await add.trigger("click");
    await wrapper!.get('input[placeholder="Chez moi, travail, famille…"]').setValue("Nouvelle destination");
    await wrapper!.get("#address-book-form").trigger("submit"); await flushPromises();
    await wrapper!.get('[aria-label="Sélectionner Nouvelle destination comme destination"]').trigger("click");
    await wrapper!.get('[data-testid="personal-journey-positive"]').setValue(80);
    await wrapper!.get('[data-testid="personal-journey-neutral"]').setValue(30);
    expect(wrapper!.get('[data-testid="personal-journey-save"]').attributes("disabled")).toBeDefined();
    await wrapper!.get('[data-testid="personal-journey-neutral"]').setValue(90);
    await wrapper!.get('[data-testid="personal-journey-save"]').trigger("submit"); await flushPromises();
    expect(api.rows.value[0]?.destination?.name).toBe("Nouvelle destination");
    expect(api.rows.value[0]?.status).toBe("ready");
  });
  it("opens the real directory, applies edited thresholds to score, edits again and deletes the row", async () => {
    boot([friend]); await flushPromises();
    expect(wrapper!.find('[data-testid="personal-journeys-empty"]').exists()).toBe(true);
    await wrapper!.get('[data-testid="personal-journey-add"]').trigger("click");
    await wrapper!.get('[aria-label="Sélectionner Amis test comme destination"]').trigger("click");
    await wrapper!.get('[data-testid="personal-journey-positive"]').setValue(20);
    await wrapper!.get('[data-testid="personal-journey-neutral"]').setValue(30);
    await wrapper!.get('[data-testid="personal-journey-save"]').trigger("submit");
    await flushPromises();
    expect(findJourneys).toHaveBeenCalledWith(expect.objectContaining({ origin: expect.objectContaining(origin.value), destination: expect.objectContaining({ lon: friend.lon, lat: friend.lat }), datetime: datetime.value }), expect.any(AbortSignal));
    expect(wrapper!.text()).toContain("Amis test : 45 min");
    expect(wrapper!.get('[data-testid="personal-journey-row"] .nearby-neighborhood-score-fact').classes().join(" ")).toContain("negative");
    const strictScore = Number(wrapper!.get("output").text());
    await wrapper!.get('[aria-label="Modifier les seuils vers Amis test"]').trigger("click");
    await wrapper!.get('[data-testid="personal-journey-neutral"]').setValue(75);
    await wrapper!.get('[data-testid="personal-journey-save"]').trigger("submit"); await flushPromises();
    expect(Number(wrapper!.get("output").text())).toBeGreaterThan(strictScore);
    expect(findJourneys).toHaveBeenCalledTimes(1);
    await wrapper!.get('[data-testid="personal-journey-remove"]').trigger("click"); await flushPromises();
    expect(api.rows.value).toHaveLength(0);
    expect(useAddressBook().entries.value).toHaveLength(1);
    expect(app.settings.value.verdictPersonalJourneys).toEqual([]);
  });
  it("adds a home-to-work journey automatically, keeps actual home coordinates and avoids duplicate selections", async () => {
    boot([home, work]); await flushPromises();
    expect(api.rows.value).toHaveLength(1);
    expect(findJourneys.mock.calls[0]![0]).toMatchObject({ origin: { lon: home.lon, lat: home.lat }, destination: { lon: work.lon, lat: work.lat } });
    expect(wrapper!.text()).toContain("Domicile → travail · Annuaire");
    api.save(work, { positiveBelowMinutes: 30, neutralThroughMinutes: 75 });
    useAddressBook().addEntry({ ...work, id: "work-alias", isWorkplace: false });
    api.save({ ...work, id: "work-alias" }, { positiveBelowMinutes: 35, neutralThroughMinutes: 80 });
    await flushPromises();
    expect(api.rows.value).toHaveLength(1);
    expect(api.rows.value[0]!.neutralThroughMinutes).toBe(80);
    api.remove(api.rows.value[0]!); await flushPromises();
    expect(api.rows.value).toHaveLength(0);
    expect(app.settings.value.verdictPersonalJourneys.some(preference => preference.disabled)).toBe(true);
  });
  it("covers directory detection and pending routing with a visible loader, never an empty flash", async () => {
    let finish!: (journeys: NearbyJourney[]) => void;
    findJourneys.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    boot([home, work]);
    expect(wrapper!.find('[data-testid="personal-journeys-loading"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="personal-journeys-empty"]').exists()).toBe(false);
    await flushPromises();
    expect(api.datasets.value.find(dataset => dataset.id === "home-work-journey")?.status).toBe("loading");
    finish([journey]); await flushPromises();
    expect(wrapper!.find('[data-testid="personal-journeys-loading"]').exists()).toBe(false);
    expect(api.datasets.value.find(dataset => dataset.id === "home-work-journey")?.status).toBe("ready");
  });
  it.each(["unavailable", "error"])("exposes %s journeys and retains delete controls", async state => {
    if (state === "error") findJourneys.mockRejectedValueOnce(new Error("503")); else findJourneys.mockResolvedValueOnce([]);
    boot([home, work]); await flushPromises();
    expect(api.rows.value[0]!.status).toBe(state);
    expect(wrapper!.find('[data-testid="personal-journey-remove"]').exists()).toBe(true);
    expect(wrapper!.find('[role="alert"]').exists()).toBe(state === "error");
    expect(api.datasets.value.find(dataset => dataset.id === "home-work-journey")?.status).toBe(state === "error" ? "error" : "missing");
    api.retry(); await flushPromises();
    expect(api.rows.value[0]!.status).toBe("ready");
  });
  it("handles no addresses, no home/work and a removed saved destination without invented journeys", async () => {
    boot([]); await flushPromises();
    expect(findJourneys).not.toHaveBeenCalled();
    expect(api.datasets.value.find(dataset => dataset.id === "home-work-journey")?.status).toBe("missing");
    api.save(friend, { positiveBelowMinutes: 30, neutralThroughMinutes: 75 }); await flushPromises();
    expect(api.rows.value[0]!.status).toBe("unavailable");
    expect(findJourneys).not.toHaveBeenCalled();
  });
  it("invalidates routes when the departure time or address coordinates change and ignores stale responses", async () => {
    boot([friend]); await flushPromises();
    api.save(friend, { positiveBelowMinutes: 30, neutralThroughMinutes: 75 }); await flushPromises();
    datetime.value = "20261023T100000"; await flushPromises();
    origin.value = { ...origin.value, lon: 2.15 }; await flushPromises();
    expect(findJourneys).toHaveBeenCalledTimes(3);
    expect(findJourneys.mock.calls.at(-1)![0]).toMatchObject({ datetime: datetime.value, origin: { lon: 2.15 } });
  });
  it("keeps obsolete asynchronous responses out of the active route", async () => {
    let oldResponse!: (journeys: NearbyJourney[]) => void;
    findJourneys.mockImplementationOnce(() => new Promise(resolve => { oldResponse = resolve; }));
    boot([friend]); await flushPromises();
    api.save(friend, { positiveBelowMinutes: 30, neutralThroughMinutes: 75 }); await flushPromises();
    origin.value = { ...origin.value, lon: 2.16 }; await flushPromises();
    oldResponse([{ ...journey, durationSeconds: 9000 }]); await flushPromises();
    expect(api.rows.value[0]?.journey?.durationSeconds).toBe(2700);
  });
  it("reports storage errors and retries directory loading", async () => {
    boot([home, work]); await flushPromises();
    useAddressBook().error.value = true; await flushPromises();
    expect(wrapper!.text()).toContain("L’annuaire n’a pas pu être chargé");
    expect(api.datasets.value[0]?.status).toBe("error");
    api.retry(); await flushPromises();
    expect(useAddressBook().error.value).toBe(false);
    app.storageError.value = true; await flushPromises();
    expect(wrapper!.text()).toContain("Les trajets personnalisés n’ont pas pu être lus ou enregistrés");
    expect(api.datasets.value[1]?.status).toBe("error");
  });
});
