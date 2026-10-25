import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref, shallowRef } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/verdict-fontenay-benchmarks.json";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import type { NeighborhoodJourneyBenchmark } from "../src/features/nearby-stations/neighborhood/contracts";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood";
import { useNearbyNeighborhoodScore } from "../src/features/nearby-stations/useNearbyNeighborhoodScore";
import { useTravelRoutes } from "../src/features/nearby-stations/useTravelRoutes";
import { createGtfsNeighborhoodTravelRoutesProvider } from "../src/services/travelRoutes/gtfsNeighborhoodTravelRoutesProvider";

afterEach(() => vi.unstubAllGlobals());

function harness(failRouting = false) {
  const query = new URL(fixture.reproductionUrl, "http://localhost").searchParams;
  const origin = ref({ lat: Number(query.get("lat")), lon: Number(query.get("lon")),
    label: query.get("address")!, city: query.get("city")! });
  const network = shallowRef({ stations: fixture.stations, lines: fixture.lines, entrances: [], regionalPaths: [],
    stationsById: new Map(fixture.stations.map(s => [s.id, s])), linesById: new Map(fixture.lines.map(l => [l.id, l])),
    pathsById: new Map(), bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  } as unknown as TransportMapNetwork);
  const stationsLoading = ref(true);
  let routingFails = failRouting;
  const routeBodies: Array<{ origin: typeof origin.value; destinations: Array<{ lon: number; lat: number; destinationRef?: string; arrivalAtPlatform?: boolean }> }> = [];
  vi.stubGlobal("Worker", undefined);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/neighborhood-journeys") {
      const body = JSON.parse(String(init?.body));
      routeBodies.push(body);
      if (routingFails) return new Response("", { status: 503 });
      return Response.json({ source: "gtfs", datasetVersion: fixture.datasetVersion,
        destinations: body.destinations.map((d: { id: string; lon: number; lat: number }) => {
          const station = fixture.stations.find(s => s.lon === d.lon && s.lat === d.lat);
          const benchmark = fixture.benchmarks.find(b => b.stationLabel === station?.name || b.id === "chatelet" && station?.name === "Châtelet - Les Halles");
          if (!benchmark) throw new Error("Unexpected benchmark coordinates");
          return { id: d.id, status: "partial", journeys: benchmark.journeys };
        }) });
    }
    if (url.includes("/api/neighborhood-verdict")) return Response.json({ schemaVersion: "1.3",
      generatedAt: new Date().toISOString(), categories: [], sources: [], warnings: [] });
    if (url.includes("/api/places/shopping-centres")) return Response.json({ centres: [] });
    if (url.includes("/api/places/supermarket-footprints")) return Response.json({ supermarketFootprints: [] });
    throw new Error(`Unexpected network request: ${url}`);
  }));
  let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
  const wrapper = mount(defineComponent({ setup() {
    const routeComposer = useTravelRoutes({ origin, travelRoutesProvider: createGtfsNeighborhoodTravelRoutesProvider() });
    score = useNearbyNeighborhoodScore({ origin, network, stations: ref([]), stationsLoading,
      journeySource: "gtfs", documentaryFirst: true, journeyDateTime: fixture.journeyDateTime,
      journeyProbe: routeComposer,
      placesProvider: { searchDestinations: async () => [], searchNearby: async () => [] },
      fetchNightAccess: async () => ({ status: "ready", journeys: [], linesExamined: 0, walkingStops: 0 }),
    });
    return () => null;
  } }));
  return { wrapper, score, stationsLoading, network, origin, routeBodies, recover: () => { routingFails = false; } };
}

describe("Fontenay Verdict benchmark regression (exact reported URL)", () => {
  it("resumes all destinations on catalogue completion and propagates GTFS durations into facts and criterion reasons", async () => {
    const h = harness();
    try {
      await flushPromises();
      expect(h.routeBodies).toHaveLength(0);
      expect(h.origin.value).toMatchObject({ lat: 48.793710645211405, lon: 2.28830452778152,
        label: "48.79371, 2.28830", city: "Fontenay-aux-Roses" });
      const sameNetwork = h.network.value;
      // The original failure missed this change when network and local station IDs stayed identical.
      h.stationsLoading.value = false;
      await vi.waitFor(() => expect(h.score.diagnostics.value.benchmarks.filter(b => b.status === "ready")).toHaveLength(10));
      await vi.waitFor(() => expect(h.score.isLoading.value).toBe(false));
      expect(h.network.value).toBe(sameNetwork);
      expect(h.routeBodies).toHaveLength(1);
      expect(h.routeBodies[0]!.origin).toMatchObject(h.origin.value);
      expect(h.routeBodies[0]!.destinations).toHaveLength(10);
      expect(h.routeBodies[0]!.destinations.filter(d => d.destinationRef).every(d => d.arrivalAtPlatform)).toBe(true);

      const transport = h.score.result.value.categories.find(c => c.id === "transport")!;
      const facts = [...transport.positiveFacts, ...transport.neutralFacts];
      for (const [family, duration] of [["employment-hub:employment-velizy", 32], ["employment-hub:employment-la-defense", 45], ["major-station:montparnasse", 32]] as const) {
        const fact = facts.find(f => f.family === family)!;
        expect(fact.labelValues?.duration).toBe(duration);
        expect(fact.travel?.journey.source).toBe("gtfs");
        expect(fact.travel?.journey.durationSeconds).toBeGreaterThan(0);
        expect(h.score.criteria.value.find(c => c.id === "transport")!.reasons).toContainEqual(fact);
      }
      expect(facts.some(f => f.kind === "employmentHubUnavailable" || f.kind === "majorStationUnavailable")).toBe(false);
      expect(h.score.criteria.value.find(c => c.id === "transport")).toMatchObject({ status: "ready",
        datasets: expect.arrayContaining([expect.objectContaining({ id: "gtfs-journeys", status: "ready" })]) });

      // Preserve the scoring contract: Châtelet contributes; employment/major-station benchmarks are context.
      expect(transport.score).toBeCloseTo(7.6);
      const withoutChatelet = buildNeighborhoodScore({ stations: [], stationsLoaded: true, places: [], placesLoaded: true,
        journeyBenchmarks: fixture.benchmarks as unknown as NeighborhoodJourneyBenchmark[], journeyBenchmarksLoading: false });
      expect(withoutChatelet.categories.find(c => c.id === "transport")!.score).toBe(1.5);
    } finally { h.wrapper.unmount(); }
  });

  it("reports routing failure separately and recovers every benchmark on retry instead of caching an error as no journey", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness(true);
    try {
      h.stationsLoading.value = false;
      await vi.waitFor(() => expect(h.score.error.value?.message).toContain("503"));
      await vi.waitFor(() => expect(h.score.isLoading.value).toBe(false));
      expect(h.score.diagnostics.value.benchmarks.every(b => b.status === "unavailable")).toBe(true);
      expect(h.score.criteria.value.find(c => c.id === "transport")!.datasets)
        .toContainEqual(expect.objectContaining({ id: "gtfs-journeys", status: "error" }));
      // Châtelet also tries its coordinate request after the failed reference batch.
      expect(h.routeBodies).toHaveLength(2);
      h.recover();
      await h.score.refresh();
      expect(h.score.diagnostics.value.benchmarks.filter(b => b.status === "ready")).toHaveLength(10);
      expect(h.score.error.value).toBeUndefined();
      expect(h.score.criteria.value.find(c => c.id === "transport")!.datasets)
        .toContainEqual(expect.objectContaining({ id: "gtfs-journeys", status: "ready" }));
      expect(h.routeBodies).toHaveLength(3);
      expect(h.routeBodies.at(-1)!.destinations).toHaveLength(10);
    } finally { h.wrapper.unmount(); warn.mockRestore(); }
  });
});
