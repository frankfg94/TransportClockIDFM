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
    visibleCandidates: { value: [] },
    isLoading: { value: false },
    error: { value: undefined as string | undefined },
    refresh: vi.fn(async () => undefined),
  },
  score: {
    result: { value: {} },
    places: { value: [] },
    isLoading: { value: false },
    error: { value: undefined as Error | undefined },
    errorSource: { value: undefined as "verdict" | "places" | "routes" | undefined },
    refresh: vi.fn(async () => undefined),
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
  vi.clearAllMocks();
  mocks.routeState.query = {};
  mocks.nearby.selectedPlace.value = undefined;
  mocks.nearby.error.value = undefined;
  mocks.nearby.isScanning.value = false;
  mocks.heavy.isLoading.value = false;
  mocks.heavy.error.value = undefined;
  mocks.score.isLoading.value = false;
  mocks.score.error.value = undefined;
  mocks.score.errorSource.value = undefined;
  mocks.useNearbyStations.mockReturnValue(mocks.nearby);
  mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
  mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
  mocks.useServiceQuality.mockReturnValue({ data: { value: undefined }, isLoading: { value: false }, error: { value: undefined }, retry: vi.fn(async () => undefined) });
});

beforeEach(() => {
  mocks.useServiceQuality.mockReturnValue({ data: { value: undefined }, isLoading: { value: false }, error: { value: undefined }, retry: vi.fn(async () => undefined) });
});

describe("NearbyNeighborhoodScorePage", () => {
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

    expect(wrapper.get("[data-testid='score-card']").attributes("data-error")).toContain("itinéraires de transport (Navitia)");
    wrapper.unmount();
  });

  it("shows a discrete loading bar and retries the failed score source", async () => {
    mocks.routeState.query = {
      lat: "48.76591",
      lon: "2.26821",
      address: "Adresse test",
    };
    mocks.score.isLoading.value = true;
    mocks.score.error.value = new Error("navitia unavailable");
    mocks.score.errorSource.value = "routes";

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
    await wrapper.get("[data-testid='retry-source']").trigger("click");
    expect(mocks.score.refresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
