import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, onMounted, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NearbyNeighborhoodScorePage from "../src/features/nearby-stations/NearbyNeighborhoodScorePage.vue";
import { useI18n } from "../src/i18n";

const mocks = vi.hoisted(() => ({
  nearby: vi.fn(), heavy: vi.fn(), score: vi.fn(), quality: vi.fn(), walking: vi.fn(), personal: vi.fn(),
  download: vi.fn(), gpe: vi.fn(),
}));
vi.mock("#imports", async importOriginal => ({
  ...await importOriginal<typeof import("#imports")>(),
  useRoute: () => ({ query: { lat: "48.85", lon: "2.35", address: "Adresse de test" } }),
  useRouter: () => ({ replace: vi.fn(async () => {}) }),
}));
vi.mock("../src/features/app-settings", () => import("../src/features/app-settings/appSettings"));
vi.mock("../src/features/nearby-stations/useNearbyStations", () => ({ useNearbyStations: mocks.nearby }));
vi.mock("../src/features/nearby-stations/useNearbyHeavyTransports", () => ({ useNearbyHeavyTransports: mocks.heavy }));
vi.mock("../src/features/nearby-stations/useNearbyNeighborhoodScore", () => ({ useNearbyNeighborhoodScore: mocks.score }));
vi.mock("../src/features/nearby-stations/useServiceQuality", () => ({ useServiceQuality: mocks.quality }));
vi.mock("../src/features/nearby-stations/useNearbyWalkingRoutes", () => ({ useNearbyWalkingRoutes: mocks.walking }));
vi.mock("../src/features/nearby-stations/useVerdictPersonalJourneys", () => ({ useVerdictPersonalJourneys: mocks.personal }));
vi.mock("../src/features/nearby-stations/useTravelRoutes", () => ({ useTravelRoutes: () => ({ probeJourneys: vi.fn() }) }));
vi.mock("../src/features/transport-map/gpeStationsApi", () => ({ fetchGpeStations: mocks.gpe }));
vi.mock("../src/features/nearby-stations/neighborhoodScorePdf", () => ({ downloadNeighborhoodScorePdf: mocks.download }));

function fixture() {
  return {
    nearby: { selectedPlace: ref({ lon: 2.35, lat: 48.85, label: "Adresse de test" }), stations: ref([]),
      transportMapNetwork: ref(), visibleStations: ref([]), activeModes: ref([]), radius: ref(600), isScanning: ref(false), error: ref() },
    heavy: { visibleCandidates: ref([]), isLoading: ref(false), error: ref(), refresh: vi.fn() },
    score: { result: ref({ categories: [{ id: "transport", labelKey: "nearbyStations.neighborhoodScore.categories.transport",
        available: true, displayScore: 7, positiveFacts: [{ family: "rail", label: "Métro accessible" }], negativeFacts: [], neutralFacts: [] }],
      displayScore: 7, band: "good", availableCategoryCount: 7, totalCategoryCount: 7, generatedAt: "2026-10-24T08:00:00Z" }),
      isLoading: ref(false), transportPending: ref<string[]>([]), backendVerdictReady: ref(true), places: ref([]),
      diagnostics: ref({ pendingTasks: [], frequencies: [] }), error: ref(), errorSource: ref(),
      criteria: ref([{ id: "transport", status: "ready", datasets: [{ id: "gtfs", required: true, status: "ready" }] }]), refresh: vi.fn() },
    quality: { data: ref(), isLoading: ref(false), error: ref(), retry: vi.fn() },
    walking: { placeRoutes: ref({}), isLoadingPlaces: ref(false), error: ref(), loadPlaceMetricsForGroup: vi.fn(), clear: vi.fn() },
    personal: { rows: ref([]), loading: ref(false), hasError: ref(false), datasets: ref([]) },
  };
}
let state: ReturnType<typeof fixture>;
let wrapper: VueWrapper | undefined;
function sectionStub(name: string, title: string) {
  return defineComponent({ name, emits: ["export-state"], setup(_, { emit }) {
    onMounted(() => emit("export-state", { loading: false, section: { title, items: ["Résultat final"] } }));
    return () => h("div");
  } });
}
async function openPage() {
  wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
    NuxtLink: true, NearbyNeighborhoodScoreCard: true, VerdictPersonalJourneys: true, AdressBook: true,
    NearbyRealEstateVerdict: sectionStub("NearbyRealEstateVerdict", "Immobilier final"),
    NeighborhoodTrafficAnnex: sectionStub("NeighborhoodTrafficAnnex", "Trafic final"),
  } } });
  await flushPromises();
  return wrapper.get<HTMLButtonElement>('[data-testid="verdict-export-pdf"]');
}

beforeEach(() => {
  state = fixture();
  mocks.nearby.mockReturnValue(state.nearby); mocks.heavy.mockReturnValue(state.heavy);
  mocks.score.mockReturnValue(state.score); mocks.quality.mockReturnValue(state.quality);
  mocks.walking.mockReturnValue(state.walking); mocks.personal.mockReturnValue(state.personal);
  mocks.gpe.mockResolvedValue([]); mocks.download.mockResolvedValue({ status: "saved" });
  useI18n().setLanguage("fr");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Verdict PDF asynchronous export", () => {
  it("keeps final document sections and prevents duplicate export while the picker is pending", async () => {
    let finish!: (value: { status: string }) => void;
    mocks.download.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const button = await openPage();
    expect(button.element.disabled).toBe(false);
    await button.trigger("click");
    expect(button.element.disabled).toBe(true);
    expect(button.attributes("aria-busy")).toBe("true");
    await button.trigger("click");
    expect(mocks.download).toHaveBeenCalledOnce();
    const [document, filename] = mocks.download.mock.calls[0]!;
    expect(document.sections.map((section: { title: string }) => section.title)).toEqual([
      "Transports", "Trafic final", "Immobilier final",
    ]);
    expect(document.sections[0].items[0]).toContain("Métro accessible");
    expect(document).not.toHaveProperty("diagnostics");
    expect(document).not.toHaveProperty("algorithm");
    expect(filename).toBe("score-quartier-adresse-de-test.pdf");
    finish({ status: "saved" }); await flushPromises();
    expect(button.element.disabled).toBe(false);
    expect(wrapper!.get('[data-testid="verdict-pdf-export-status"]').text()).toBe("PDF enregistré.");
  });

  it.each([
    ["cancelled", "Export PDF annulé."], ["downloaded", "Téléchargement du PDF démarré."],
  ])("restores the button after %s", async (status, message) => {
    mocks.download.mockResolvedValue({ status });
    const button = await openPage(); await button.trigger("click"); await flushPromises();
    expect(button.element.disabled).toBe(false);
    expect(wrapper!.get('[data-testid="verdict-pdf-export-status"]').text()).toBe(message);
  });

  it("shows native errors and permits a successful retry", async () => {
    mocks.download.mockRejectedValueOnce(new Error("PDF_WRITE_FAILED"));
    const button = await openPage(); await button.trigger("click"); await flushPromises();
    expect(button.element.disabled).toBe(false);
    expect(wrapper!.get('[role="alert"]').text()).toContain("Réessayez");
    await button.trigger("click"); await flushPromises();
    expect(wrapper!.get('[data-testid="verdict-pdf-export-status"]').text()).toBe("PDF enregistré.");
  });

  it.each(["stations", "score", "heavy", "walking", "quality", "personal", "transport", "criterion", "dataset", "future"])(
    "keeps export locked for the independent %s loader", async source => {
      if (source === "stations") state.nearby.isScanning.value = true;
      if (source === "score") state.score.isLoading.value = true;
      if (source === "heavy") state.heavy.isLoading.value = true;
      if (source === "walking") state.walking.isLoadingPlaces.value = true;
      if (source === "quality") state.quality.isLoading.value = true;
      if (source === "personal") state.personal.loading.value = true;
      if (source === "transport") state.score.transportPending.value = ["frequencies"];
      if (source === "criterion") state.score.criteria.value[0]!.status = "loading";
      if (source === "dataset") state.score.criteria.value[0]!.datasets[0]!.status = "loading";
      if (source === "future") { state.score.backendVerdictReady.value = false; mocks.gpe.mockReturnValue(new Promise(() => {})); }
      const button = await openPage();
      expect(button.element.disabled).toBe(true);
      await button.trigger("click"); expect(mocks.download).not.toHaveBeenCalled();
    },
  );

  it.each(["NearbyRealEstateVerdict", "NeighborhoodTrafficAnnex"])("keeps export locked while %s is loading", async name => {
    const button = await openPage();
    wrapper!.findComponent({ name }).vm.$emit("export-state", { loading: true });
    await flushPromises();
    expect(button.element.disabled).toBe(true);
    await button.trigger("click"); expect(mocks.download).not.toHaveBeenCalled();
  });
});
