import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, onMounted, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NearbyNeighborhoodScorePage from "../src/features/nearby-stations/NearbyNeighborhoodScorePage.vue";
import VerdictPdfMap from "../src/features/nearby-stations/VerdictPdfMap.vue";
import { resolveVerdictPdfOptions } from "../src/features/nearby-stations/verdictPdfReport";
import { comparisonOriginKey } from "../src/features/nearby-stations/neighborhood-comparison/types";
import { useI18n } from "../src/i18n";

const mocks = vi.hoisted(() => ({
  nearby: vi.fn(), heavy: vi.fn(), score: vi.fn(), quality: vi.fn(), walking: vi.fn(), personal: vi.fn(),
  download: vi.fn(), gpe: vi.fn(), commerce: vi.fn(),
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
vi.mock("../src/features/nearby-stations/cityCommerceSnapshot", async importOriginal => ({
  ...await importOriginal<typeof import("../src/features/nearby-stations/cityCommerceSnapshot")>(),
  loadCityCommerceSnapshot: mocks.commerce,
}));

function fixture() {
  return {
    nearby: { selectedPlace: ref({ lon: 2.35, lat: 48.85, label: "Adresse de test" }), stations: ref([]),
      transportMapNetwork: ref(), visibleStations: ref([]), activeModes: ref([]), radius: ref(600), isScanning: ref(false), error: ref() },
    heavy: { visibleCandidates: ref([]), accessProgress: ref([]), isLoading: ref(false), error: ref(), refresh: vi.fn() },
    score: { result: ref({ categories: [{ id: "transport", labelKey: "nearbyStations.neighborhoodScore.categories.transport",
        available: true, displayScore: 7, positiveFacts: [{ family: "rail", label: "Métro accessible" }], negativeFacts: [], neutralFacts: [] }],
      displayScore: 7, band: "good", availableCategoryCount: 7, totalCategoryCount: 7, generatedAt: "2026-10-24T08:00:00Z",
      positiveFacts: [{ family: "rail", label: "Métro accessible" }], negativeFacts: [], neutralFacts: [], sources: [], warnings: [] }),
      isLoading: ref(false), transportPending: ref<string[]>([]), backendVerdictReady: ref(true), backendVerdict: ref(), places: ref([]),
      countStructuralLinesFor: vi.fn(() => 0),
      diagnostics: ref({ pendingTasks: [], frequencies: [] }), error: ref(), errorSource: ref(), gtfsCoverageMissing: ref(false),
      criteria: ref([{ id: "transport", status: "ready", datasets: [{ id: "gtfs", required: true, status: "ready" }] }]), refresh: vi.fn() },
    quality: { data: ref(), isLoading: ref(false), error: ref(), retry: vi.fn() },
    walking: { placeRoutes: ref({}), isLoadingPlaces: ref(false), error: ref(), loadPlaceMetricsForGroup: vi.fn(), clear: vi.fn() },
    personal: { rows: ref([]), loading: ref(false), hasError: ref(false), datasets: ref([]) },
  };
}
let state: ReturnType<typeof fixture>;
let wrapper: VueWrapper | undefined;
let comparisonLoading: boolean;
const ComparisonStub = defineComponent({
  name: "VerdictScopeComparison",
  emits: ["report-state"],
  setup(_, { emit }) {
    onMounted(() => emit("report-state", { originKey: comparisonOriginKey(state.nearby.selectedPlace.value), loading: comparisonLoading }));
    return () => h("div");
  },
});
const PdfMapStub = defineComponent({ name: "VerdictPdfMap", setup(_, { expose }) {
  expose({ waitUntilReady: async () => {} });
  return () => h("div", { "data-testid": "verdict-pdf-map-stub" });
} });
function sectionStub(name: string, title: string) {
  return defineComponent({ name, emits: ["export-state"], setup(_, { emit }) {
    onMounted(() => emit("export-state", { loading: false, section: { title, items: ["Résultat final"] } }));
    return () => h("div");
  } });
}
async function openPage() {
  wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
    NuxtLink: true, NearbyNeighborhoodScoreCard: true, VerdictPersonalJourneys: true, AdressBook: true,
    VerdictScopeComparison: ComparisonStub,
    VerdictPdfMap: PdfMapStub,
    NearbyRealEstateVerdict: sectionStub("NearbyRealEstateVerdict", "Immobilier final"),
    NeighborhoodTrafficAnnex: sectionStub("NeighborhoodTrafficAnnex", "Trafic final"),
  } } });
  await flushPromises();
  return wrapper.get<HTMLButtonElement>('[data-testid="verdict-export-pdf"]');
}

beforeEach(() => {
  state = fixture();
  comparisonLoading = false;
  mocks.nearby.mockReturnValue(state.nearby); mocks.heavy.mockReturnValue(state.heavy);
  mocks.score.mockReturnValue(state.score); mocks.quality.mockReturnValue(state.quality);
  mocks.walking.mockReturnValue(state.walking); mocks.personal.mockReturnValue(state.personal);
  mocks.gpe.mockResolvedValue([]); mocks.download.mockResolvedValue({ status: "saved" });
  mocks.commerce.mockResolvedValue(undefined);
  useI18n().setLanguage("fr");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Verdict PDF asynchronous export", () => {
  it("settles the map page when WebGL is unavailable", async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const mapPage = mount(VerdictPdfMap, { props: {
      kind: "commerce",
      page: { id: "commerce", kind: "map", mapType: "commerce", title: "Commerces", subtitle: "" },
      context: { areas: [], selectedCodes: [], greenReferences: [] },
      options: resolveVerdictPdfOptions(),
    } });
    try {
      await mapPage.vm.waitUntilReady();
      expect(mapPage.get(".vr-map-notice").text()).toBe("La carte n’a pas pu être préparée.");
      expect(mapPage.find(".vr-map-loading").exists()).toBe(false);
    } finally {
      mapPage.unmount();
      getContext.mockRestore();
    }
  });

  it("exports the focused commerce map and the separate full-commune pages for a dense inventory", async () => {
    const commerceSnapshot = {
      key: "75056|test",
      commune: { code: "75056", name: "Paris", bbox: [2.2, 48.8, 2.5, 49] },
      dataset: { id: "test", version: "1", generatedAt: "2026-11-23", schemaVersion: 1,
        normalizationVersion: "1", attribution: "Test", license: "Test" },
      places: [],
      commerces: Array.from({ length: 120 }, (_, index) => ({ id: `shop-${index}`, lon: 2.35 + index * 0.000001,
        lat: 48.85, name: `Commerce ${index}`, category: "commerce", groupId: "shop", iconId: "shop",
        color: "#593cc3", typeKey: `nearbyCommerce.type${index}`, place: {} })),
      categories: Array.from({ length: 120 }, (_, index) => ({ id: `type-${index}`, labelKey: `nearbyCommerce.type${index}`,
        iconId: "shop", color: "#593cc3", count: 1 })),
      recordedTotal: 120, mappedTotal: 120, unmappedTotal: 0, neighborhoodCommerceCounts: {},
    };
    mocks.commerce.mockResolvedValue(commerceSnapshot);
    const button = await openPage();
    await button.trigger("click");
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());

    const root = mocks.download.mock.calls[0]![0] as HTMLElement;
    const sheets = [...root.querySelectorAll<HTMLElement>("[data-verdict-pdf-sheet]")];
    const ids = sheets.map(sheet => sheet.dataset.verdictPdfSheet);
    expect(sheets.find(sheet => sheet.dataset.verdictPdfSheet === "commune-commerce-map")?.querySelector("h2")?.textContent)
      .toContain("Commerces à proximité de l’adresse");
    expect(ids.filter(id => id?.startsWith("nearby-commerce-legend-"))).toHaveLength(3);
    expect(ids).toContain("commune-commerce-map-overview");
    expect(ids.filter(id => id?.startsWith("commune-commerce-legend-overview-"))).toHaveLength(3);
  });

  it("exports the dated historical warning in the transport section with its facts", async () => {
    vi.stubGlobal("Worker", undefined);
    const old = { startDate: "20190501", endDate: "20190531" };
    let publish!: (response: Response) => void;
    const calendar = new Promise<Response>(resolve => { publish = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => calendar));
    const button = await openPage();
    expect(button.element.disabled).toBe(true);
    publish(Response.json({ calendar: { schemaVersion: 1, cacheGeneration: 1,
      routing: { ...old, path: "routing/old", maxTimeSeconds: 90000 }, timetable: { ...old, path: "timetables/old" } } }));
    await vi.waitFor(() => expect(button.element.disabled).toBe(false));
    await button.trigger("click");
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    const transport = (mocks.download.mock.calls[0]![0] as HTMLElement).querySelector('[data-verdict-pdf-sheet="transport"]')!;
    expect(transport.querySelector(".vr-notice")?.textContent).toMatch(/GTFS a expiré.*2019.*indicatifs/u);
    expect(transport.textContent).toContain("Métro accessible");
  });
  it("keeps final document sections and prevents duplicate export while the picker is pending", async () => {
    let finish!: (value: { status: string }) => void;
    mocks.download.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const button = await openPage();
    expect(button.element.disabled).toBe(false);
    await button.trigger("click");
    expect(button.element.disabled).toBe(true);
    expect(button.attributes("aria-busy")).toBe("true");
    await button.trigger("click");
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    const [root, filename] = mocks.download.mock.calls[0]! as [HTMLElement, string];
    expect(root.getAttribute("aria-hidden")).toBe("true");
    const sheets = [...root.querySelectorAll("[data-verdict-pdf-sheet]")];
    expect(sheets.map(sheet => sheet.querySelector("h2")?.textContent)).toEqual([
      "Sommaire", "Verdict global", "La ville en quelques chiffres", "Commerces de la commune", "Tous les transports de la ville · Métro, trains, tram et câble",
      "Transports autour de l’adresse · Métro, trains, tram et câble", "Bus à proximité", "Noctiliens à proximité", "Parcs et espaces verts", "Bruit à l’échelle du quartier",
      "Transports", "Trafic final", "Immobilier final", "Comparaison des quartiers", "Sources et limites", "Mot de la fin",
    ]);
    expect(sheets[0]!.querySelector(".vr-contents li:last-child")?.textContent).toBe("Mot de la fin16");
    expect(sheets[1]!.querySelector(".vr-score-hero strong")?.textContent).toBe("7 / 10");
    expect(sheets[10]!.querySelector(".vr-score")?.textContent).toBe("7 / 10");
    expect(sheets[10]!.textContent).toContain("Métro accessible");
    expect(sheets.at(-1)?.querySelector(".vr-footer strong")?.textContent).toBe("Page 16 sur 16");
    expect(filename).toBe("score-quartier-adresse-de-test.pdf");
    finish({ status: "saved" }); await flushPromises();
    expect(button.element.disabled).toBe(false);
    expect(wrapper!.get('[data-testid="verdict-pdf-export-status"]').text()).toBe("PDF enregistré.");
  });

  it("exports the original score and completed comparison in English", async () => {
    comparisonLoading = true;
    useI18n().setLanguage("en");
    const button = await openPage();
    await button.trigger("click");
    expect(mocks.download).not.toHaveBeenCalled();
    state.score.result.value = { ...state.score.result.value, displayScore: 2 };
    wrapper!.getComponent({ name: "VerdictScopeComparison" }).vm.$emit("report-state", {
      originKey: comparisonOriginKey(state.nearby.selectedPlace.value), loading: false,
    });
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    const root = mocks.download.mock.calls[0]![0] as HTMLElement;
    expect(root.getAttribute("lang")).toBe("en");
    expect(root.querySelector(".vr-score-hero strong")?.textContent).toBe("7 / 10");
    expect(root.textContent).toContain("Final thoughts");
  });

  it("exports available figures after the ten-second comparison deadline", async () => {
    comparisonLoading = true;
    const button = await openPage();
    vi.useFakeTimers();
    await button.trigger("click");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocks.download).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.download).toHaveBeenCalledOnce();
    const root = mocks.download.mock.calls[0]![0] as HTMLElement;
    expect(root.querySelectorAll(".vr-metric")).toHaveLength(6);
  });

  it.each([
    ["cancelled", "Export PDF annulé."], ["downloaded", "Téléchargement du PDF démarré."],
  ])("restores the button after %s", async (status, message) => {
    mocks.download.mockResolvedValue({ status });
    const button = await openPage(); await button.trigger("click"); await flushPromises();
    expect(button.element.disabled).toBe(false);
    expect(wrapper!.get('[data-testid="verdict-pdf-export-status"]').text()).toBe(message);
  });

  it("clears the previous export status when the analyzed address changes", async () => {
    const button = await openPage();
    await button.trigger("click"); await flushPromises();
    expect(wrapper!.get('[data-testid="verdict-pdf-export-status"]').text()).toBe("PDF enregistré.");

    state.nearby.selectedPlace.value = { lon: 2.28, lat: 48.76, label: "Nouvelle adresse" };
    await flushPromises();

    expect(wrapper!.find('[data-testid="verdict-pdf-export-status"]').exists()).toBe(false);
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
