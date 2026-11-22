import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NearbyNeighborhoodScorePage from "../src/features/nearby-stations/NearbyNeighborhoodScorePage.vue";

const mocks = vi.hoisted(() => ({
  routeState: {
    query: {} as Record<string, unknown>,
  },
  router: {
    replace: vi.fn(async () => undefined),
  },
  useNearbyStations: vi.fn(),
  useNearbyHeavyTransports: vi.fn(),
  useNearbyNeighborhoodScore: vi.fn(),
  useServiceQuality: vi.fn(),
  nearby: {
    selectedPlace: { value: undefined as { lon: number; lat: number; label?: string } | undefined },
    stations: { value: [] },
    transportMapNetwork: { value: undefined },
    visibleStations: { value: [] },
    activeModes: { value: [] },
    radius: { value: 600 },
    isScanning: { value: false },
    error: { value: undefined as Error | undefined },
  },
  heavy: {
    accessProgress: { value: [] as { id: string }[] },
    visibleCandidates: { value: [] },
    isLoading: { value: false },
    error: { value: undefined as string | undefined },
    refresh: vi.fn(async () => undefined),
    retryFailed: vi.fn(async () => undefined),
    whenSettled: vi.fn(async () => undefined),
  },
  score: {
    backendVerdict: { value: undefined },
    countStructuralLinesFor: vi.fn(() => 2),
    transportPending: { value: [] as string[] },
    result: { value: {} },
    diagnostics: { value: { pendingTasks: [] as string[], frequencies: [] } },
    places: { value: [] },
    isLoading: { value: false },
    error: { value: undefined as Error | undefined },
    errorSource: { value: undefined as "verdict" | "places" | "routes" | "timetables" | undefined },
    gtfsCoverageMissing: { value: false },
    criteria: { value: Array.from({ length: 7 }, (_, index) => ({
      id: `indicator-${index}`,
      status: "ready",
      datasets: [],
    })) as Array<{ id: string; status: "ready" | "loading"; datasets: Array<{ id: string; required: boolean; status: "ready" | "loading" }> }> },
    refresh: vi.fn(async () => undefined),
    retryFailedTransport: vi.fn(async () => undefined),
    waitForTransport: vi.fn(async () => undefined),
  },
}));

vi.mock("#imports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#imports")>();
  return {
    ...actual,
    useRoute: () => mocks.routeState,
    useRouter: () => mocks.router,
  };
});

vi.mock("../src/features/nearby-stations/useNearbyStations", () => ({
  useNearbyStations: mocks.useNearbyStations,
}));
vi.mock("../src/features/nearby-stations/useNearbyHeavyTransports", () => ({
  useNearbyHeavyTransports: mocks.useNearbyHeavyTransports,
}));
vi.mock("../src/features/nearby-stations/useNearbyNeighborhoodScore", () => ({
  useNearbyNeighborhoodScore: mocks.useNearbyNeighborhoodScore,
}));
vi.mock("../src/features/nearby-stations/useServiceQuality", () => ({
  useServiceQuality: mocks.useServiceQuality,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.routeState.query = {};
  mocks.nearby.selectedPlace.value = undefined;
  mocks.nearby.error.value = undefined;
  mocks.nearby.isScanning.value = false;
  mocks.heavy.isLoading.value = false;
  mocks.heavy.accessProgress.value = [];
  mocks.heavy.error.value = undefined;
  mocks.score.isLoading.value = false;
  mocks.score.transportPending.value = [];
  mocks.score.error.value = undefined;
  mocks.score.errorSource.value = undefined;
  mocks.score.gtfsCoverageMissing.value = false;
  mocks.score.criteria.value = Array.from({ length: 7 }, (_, index) => ({ id: `indicator-${index}`, status: "ready" as const, datasets: [] }));
  mocks.useNearbyStations.mockReturnValue(mocks.nearby);
  mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
  mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
  mocks.useServiceQuality.mockReturnValue({ data: { value: undefined }, isLoading: { value: false }, error: { value: undefined }, retry: vi.fn(async () => undefined) });
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
  mocks.useServiceQuality.mockReturnValue({ data: { value: undefined }, isLoading: { value: false }, error: { value: undefined }, retry: vi.fn(async () => undefined) });
});

describe("NearbyNeighborhoodScorePage", () => {
  it("passes the shared nature focus through and keeps the address when a different zone is selected", () => {
    const query = { lat: "48.7814", lon: "2.1967", address: "Louvois", compare: "1", focus: "nature:park:sceaux" };
    mocks.routeState.query = query;
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
      NuxtLink: true, NearbyNeighborhoodScoreCard: true, NearbyRealEstateVerdict: true, VerdictScopeComparison: true,
    } } });
    try {
      const card = wrapper.getComponent({ name: "NearbyNeighborhoodScoreCard" });
      expect(card.props("natureFocus")).toBe(query.focus);
      card.vm.$emit("update:natureFocus", "nature:woodland:Forêt de Meudon");
      expect(mocks.router.replace).toHaveBeenLastCalledWith({ query: { ...query, focus: "nature:woodland:Forêt de Meudon" } });
      card.vm.$emit("update:natureFocus", undefined);
      expect(mocks.router.replace).toHaveBeenLastCalledWith({ query: { ...query, focus: undefined } });
    } finally { wrapper.unmount(); }
  });
  it("keeps the last dated timetable through a failed check and switches to the published HTTP calendar", async () => {
    vi.stubGlobal("Worker", undefined);
    let publication: "old" | "offline" | "new" = "old";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/api/gtfs/status") || publication === "offline") return new Response("", { status: 503 });
      const range = publication === "old" ? { startDate: "20190501", endDate: "20190531" } : { startDate: "20200101", endDate: "20991231" };
      return Response.json({ calendar: { schemaVersion: 1, cacheGeneration: 1,
        routing: { ...range, path: `routing/${publication}`, maxTimeSeconds: 92000 }, timetable: { ...range, path: `timetables/${publication}` } } });
    });
    vi.stubGlobal("fetch", fetcher);
    mocks.routeState.query = { lat: "48.798965", lon: "2.279473", debugVerdict: "1" };
    mocks.nearby.selectedPlace.value = { lat: 48.798965, lon: 2.279473, label: "Châtillon" };
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
      NuxtLink: true, VerdictPersonalJourneys: true,
      NearbyNeighborhoodScoreCard: { template: '<section><slot name="personal-journeys" /></section>' },
    } } });
    try {
      const notice = "[data-testid=verdict-gtfs-reference]";
      await vi.waitFor(() => expect(wrapper.get(notice).text()).toContain("2019"));
      const archived = wrapper.get(notice).text();
      publication = "offline";
      await wrapper.get(notice + " button").trigger("click");
      await vi.waitFor(() => expect(mocks.score.retryFailedTransport).toHaveBeenCalledOnce());
      expect(wrapper.get(notice).text()).toBe(archived);
      publication = "new";
      await wrapper.get(notice + " button").trigger("click");
      await vi.waitFor(() => expect(wrapper.find(notice).exists()).toBe(false));
      expect(mocks.score.waitForTransport).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls.some(([url]) => String(url).includes("calendar=1&fresh=1"))).toBe(true);
      expect(JSON.parse(wrapper.get("[data-testid=verdict-debug]").text()).gtfsReference).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
  it("presents the GTFS coverage retry when places also fail", async () => {
    mocks.routeState.query = { lat: "48.798965", lon: "2.279473" };
    mocks.nearby.selectedPlace.value = { lat: 48.798965, lon: 2.279473, label: "Châtillon" };
    mocks.score.gtfsCoverageMissing.value = true;
    mocks.score.errorSource.value = "places";
    mocks.score.error.value = new Error("places unavailable");
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: { NuxtLink: true, NearbyNeighborhoodScoreCard: {
      props: ["error"], emits: ["retry-source"], template: "<button data-testid='retry' @click=\"$emit('retry-source')\">{{ error }}</button>",
    } } } });
    try {
      expect(wrapper.get("[data-testid=retry]").text()).toContain("calendrier GTFS");
      await wrapper.get("[data-testid=retry]").trigger("click");
      await vi.waitFor(() => expect(mocks.score.retryFailedTransport).toHaveBeenCalledOnce());
      expect(mocks.score.refresh).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });
  it("switches between the neighborhood and city comparison for the selected address", async () => {
    mocks.routeState.query = { lat: "48.7814", lon: "2.1967", address: "Louvois" };
    mocks.nearby.selectedPlace.value = { lat: 48.7814, lon: 2.1967, label: "Louvois" };
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
      NuxtLink: true, NearbyNeighborhoodScoreCard: true, NearbyRealEstateVerdict: true,
      VerdictScopeComparison: { name: "VerdictScopeComparison", props: ["origin", "scope"], template: "<div data-testid='comparison-stub' />" },
    } } });
    const comparison = wrapper.getComponent({ name: "VerdictScopeComparison" });
    expect(comparison.props("scope")).toBe("neighborhood");
    await wrapper.get("#verdict-tab-rest").trigger("click");
    expect(comparison.props("origin")).toMatchObject({ lat: 48.7814, lon: 2.1967 });
    expect(comparison.props("scope")).toBe("rest");
    expect(wrapper.findComponent({ name: "NearbyNeighborhoodScoreCard" }).exists()).toBe(false);
    await wrapper.get("#verdict-tab-neighborhood").trigger("click");
    expect(comparison.props("scope")).toBe("neighborhood");
    wrapper.unmount();
  });
  it("preserves the exact Fontenay reproduction coordinates and requests the complete benchmark catalogue", () => {
    const url = new URL("http://localhost/nearby-neighborhood-score?lat=48.793710645211405&lon=2.28830452778152&address=48.79371,+2.28830&city=Fontenay-aux-Roses");
    mocks.routeState.query = Object.fromEntries(url.searchParams);
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
      NuxtLink: true, NearbyNeighborhoodScoreCard: true, NearbyRealEstateVerdict: true,
    } } });
    expect(mocks.useNearbyStations).toHaveBeenCalledWith(expect.objectContaining({ stationCatalog: "full",
      initialDraft: expect.objectContaining({ selectedPlace: expect.objectContaining({
        lat: 48.793710645211405, lon: 2.28830452778152, label: "48.79371, 2.28830", city: "Fontenay-aux-Roses",
      }) }) }));
    expect(mocks.useNearbyNeighborhoodScore).toHaveBeenCalledWith(expect.objectContaining({ journeySource: "gtfs",
      journeyProbe: expect.objectContaining({ probeJourneys: expect.any(Function) }) }));
    wrapper.unmount();
  });

  it("passes the active transport tasks to the score card instead of rendering them above it", () => {
    mocks.routeState.query = { lat: "48.764151", lon: "2.267785" };
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    mocks.heavy.isLoading.value = true;
    mocks.heavy.accessProgress.value = [{ id: "a" }, { id: "a" }, { id: "b" }];
    mocks.score.transportPending.value = ["journey:employment-la-defense", "journey:chatelet", "frequency:rer-b", "branches:rer-b"];
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: { NuxtLink: true, NearbyNeighborhoodScoreCard: true } } });
    const tasks = wrapper.findComponent({ name: "NearbyNeighborhoodScoreCard" }).props("transportLoadingTasks");
    expect(tasks.map((task: { id: string }) => task.id)).toEqual(expect.arrayContaining(["heavyAccess", "employmentHubs", "majorStations", "frequencies", "branches"]));
    expect(tasks.find((task: { id: string }) => task.id === "heavyAccess")).toMatchObject({ counts: { accesses: 2, lines: 2 } });
    expect(wrapper.find(".transport-loading").exists()).toBe(false);
    expect(mocks.useNearbyHeavyTransports.mock.calls.at(-1)?.[1]).toMatchObject({ retainAllCandidates: true, includeContextAccess: true });
    wrapper.unmount();
  });
  it.each([undefined, "0", "1"])("exposes public diagnostic data only for debugVerdict=1 (%s)", (flag) => {
    mocks.routeState.query = { lat: "48.76591", lon: "2.26821", debugVerdict: flag };
    mocks.nearby.selectedPlace.value = { lat: 48.76591, lon: 2.26821, label: "Adresse test" };
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
      NuxtLink: true, NearbyNeighborhoodScoreCard: true,
    } } });
    expect(wrapper.find('[data-testid="verdict-debug"]').exists()).toBe(flag === "1");
    if (flag === "1") {
      const diagnostic = JSON.parse(wrapper.get('[data-testid="verdict-debug"]').text());
      expect(diagnostic.origin).toEqual(mocks.nearby.selectedPlace.value);
      expect(diagnostic.loading.page).toBe(true); // Personal address hydration is still pending on initial mount.
      expect(diagnostic.diagnostics).toEqual(mocks.score.diagnostics.value);
      expect(diagnostic).not.toHaveProperty("runtimeConfig");
    }
    wrapper.unmount();
  });
  it.each(["heavy", "routes"])("keeps GTFS retries independent from a PRIM rate limit (%s)", (source) => {
    mocks.routeState.query = { lat: "48.76591", lon: "2.26821" };
    if (source === "heavy") mocks.heavy.error.value = "navitia-journeys-429";
    else {
      mocks.score.error.value = new Error("navitia-journeys-429");
      mocks.score.errorSource.value = "routes";
    }
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
    const wrapper = mount(NearbyNeighborhoodScorePage, { global: { stubs: {
      NearbyNeighborhoodScoreCard: { props: ["error"], template: "<div data-testid='score-card' :data-error='error' />" },
    } } });
    expect(wrapper.get("[data-testid='score-card']").attributes("data-error")).not.toContain("Navitia");
    wrapper.unmount();
  });
  it("loads the score component from exact coordinates and keeps the directory handoff", () => {
    mocks.routeState.query = {
      lat: "48.76591",
      lon: "2.26821",
      address: "277 avenue de la division leclerc, Châtenay-Malabry",
      city: "Châtenay-Malabry",
    };
    mocks.useNearbyStations.mockReturnValue(mocks.nearby);
    mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
    mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);

    const wrapper = mount(NearbyNeighborhoodScorePage, {
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: "<a :href='to'><slot /></a>",
          },
          NearbyNeighborhoodScoreCard: {
            props: ["directoryUrl", "originLabel", "error"],
            template: "<div data-testid='score-card' :data-directory='directoryUrl' :data-origin='originLabel' :data-error='error' />",
          },
        },
      },
    });

    expect(mocks.useNearbyStations).toHaveBeenCalledWith(expect.objectContaining({
      stationCatalog: "full",
      initialDraft: expect.objectContaining({
        selectedPlace: expect.objectContaining({
          lat: 48.76591,
          lon: 2.26821,
          provider: "global-map",
        }),
      }),
    }));
    expect(wrapper.get("[data-testid='score-card']").attributes("data-origin")).toContain("277 avenue");
    expect(wrapper.get("[data-testid='score-card']").attributes("data-directory")).toContain(
      "/nearby-stations?lat=48.76591&lon=2.26821",
    );
    expect(wrapper.get("[data-testid='score-card']").attributes("data-directory")).toContain("annuary=");
    wrapper.unmount();
  });

  it("names the unavailable route source in the partial-error banner", () => {
    mocks.routeState.query = {
      lat: "48.76591",
      lon: "2.26821",
      address: "Adresse test",
    };
    mocks.score.error.value = new Error("navitia unavailable");
    mocks.score.errorSource.value = "routes";

    const wrapper = mount(NearbyNeighborhoodScorePage, {
      global: {
        stubs: {
          NuxtLink: true,
          NearbyNeighborhoodScoreCard: {
            props: ["error"],
            template: "<div data-testid='score-card' :data-error='error' />",
          },
        },
      },
    });

    expect(wrapper.get("[data-testid='score-card']").attributes("data-error")).toContain("GTFS");
    wrapper.unmount();
  });

  it("shows a discrete loading bar and retries both failed transport sources", async () => {
    mocks.routeState.query = {
      lat: "48.76591",
      lon: "2.26821",
      address: "Adresse test",
    };
    mocks.score.isLoading.value = true;
    mocks.score.criteria.value = Array.from({ length: 7 }, (_, index) => ({
      id: `indicator-${index}`,
      status: index === 0 ? "loading" as const : "ready" as const,
      datasets: [{ id: `source-${index}`, required: true, status: index === 0 ? "loading" as const : "ready" as const }],
    }));
    mocks.score.error.value = new Error("navitia unavailable");
    mocks.score.errorSource.value = "routes";
    mocks.heavy.error.value = "heavy access unavailable";

    const wrapper = mount(NearbyNeighborhoodScorePage, {
      global: {
        stubs: {
          NuxtLink: true,
          NearbyNeighborhoodScoreCard: {
            props: ["error", "loading", "retrying"],
            template: `
              <div data-testid="score-card" :data-loading="loading" :data-error="error">
                <button v-if="error" data-testid="retry-source" type="button" @click="$emit('retry-source')" />
              </div>
            `,
          },
        },
      },
    });

    expect(wrapper.get(".nearby-neighborhood-score-page__loading-bar").attributes("role")).toBe("progressbar");
    expect(wrapper.get(".nearby-neighborhood-score-page__loading-bar").attributes("aria-valuenow")).toBe("6");
    expect(wrapper.get(".nearby-neighborhood-score-page__loading-bar").attributes("aria-valuemax")).toBe("7");
    await wrapper.get("[data-testid='retry-source']").trigger("click");
    await vi.waitFor(() => expect(mocks.score.retryFailedTransport).toHaveBeenCalledTimes(1));
    expect(mocks.heavy.retryFailed).toHaveBeenCalledTimes(1);
    expect(mocks.score.refresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
