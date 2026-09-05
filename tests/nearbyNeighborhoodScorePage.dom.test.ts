import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  nearby: {
    selectedPlace: { value: undefined as { lon: number; lat: number; label?: string } | undefined },
    stations: { value: [] },
    transportMapNetwork: { value: undefined },
    visibleStations: { value: [] },
    activeModes: { value: [] },
    radius: { value: 600 },
    isScanning: { value: false },
  },
  heavy: {
    visibleCandidates: { value: [] },
    isLoading: { value: false },
    error: { value: undefined as string | undefined },
  },
  score: {
    result: { value: {} },
    places: { value: [] },
    isLoading: { value: false },
    error: { value: undefined as Error | undefined },
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

afterEach(() => {
  vi.clearAllMocks();
  mocks.routeState.query = {};
  mocks.nearby.selectedPlace.value = undefined;
  mocks.useNearbyStations.mockReturnValue(mocks.nearby);
  mocks.useNearbyHeavyTransports.mockReturnValue(mocks.heavy);
  mocks.useNearbyNeighborhoodScore.mockReturnValue(mocks.score);
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
            props: ["directoryUrl", "originLabel"],
            template: "<div data-testid='score-card' :data-directory='directoryUrl' :data-origin='originLabel' />",
          },
        },
      },
    });

    expect(mocks.useNearbyStations).toHaveBeenCalledWith(expect.objectContaining({
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
});
