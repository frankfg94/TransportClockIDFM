import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import type { NearbyHeavyTransportCandidate, NearbyJourney, TravelRoutesProvider } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { NearbyPlace, PlacesProvider } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";
import { useNearbyNeighborhoodScore } from "../src/features/nearby-stations/useNearbyNeighborhoodScore";

// Each test may provide its own verdict response; never use a live backend.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No verdict fixture"); }));
});
afterEach(() => vi.unstubAllGlobals());

function createLine(): GlobalMapLine {
  return {
    id: "line:metro:4",
    index: 1,
    code: "4",
    label: "4",
    mode: "METRO",
    color: "#5146ff",
    textColor: "#fff",
    aliases: [],
    stationIds: ["station:chatelet"],
    geometryIds: [],
  };
}

function createNetwork(
  line: GlobalMapLine,
  coordinates: { lon: number; lat: number } = { lon: 2.347, lat: 48.858 },
): TransportMapNetwork {
  const station = {
    id: "station:chatelet",
    index: 1,
    name: "Châtelet",
    normalizedName: "chatelet",
    aliases: [],
    rawRefs: ["station:chatelet"],
    lineIds: [line.id],
    ownerChunkId: "fixture",
    isHub: true,
    sourceCrs: "EPSG:2154" as const,
    sourceX: 650000,
    sourceY: 6860000,
    lon: coordinates.lon,
    lat: coordinates.lat,
    worldX: 0,
    worldY: 0,
    coordinateSource: "gtfs" as const,
    transformVersion: "lambert93-ntf-v1" as const,
  } satisfies GlobalMapStation;
  return {
    lines: [line],
    stations: [station],
    entrances: [],
    regionalPaths: [],
    pathsById: new Map(),
    linesById: new Map([[line.id, line]]),
    stationsById: new Map([[station.id, station]]),
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
}

function createNoctilienNetwork(): TransportMapNetwork {
  const n62 = {
    ...createLine(),
    id: "line:noctilien:62",
    code: "N62",
    label: "N62",
    mode: "NOCTILIEN" as const,
    stationIds: ["station:noctilien-62"],
  };
  const n63 = {
    ...createLine(),
    id: "line:noctilien:63",
    code: "N63",
    label: "N63",
    mode: "NOCTILIEN" as const,
    stationIds: ["station:noctilien-63"],
  };
  const n62Station = {
    ...createNetwork(n62, { lon: 2.302, lat: 48.821 }).stations[0]!,
    id: "station:noctilien-62",
    name: "Arrêt N62",
    normalizedName: "arret n62",
    rawRefs: ["station:noctilien-62"],
    lineIds: [n62.id],
  };
  const n63Station = {
    ...createNetwork(n63, { lon: 2.304, lat: 48.822 }).stations[0]!,
    id: "station:noctilien-63",
    name: "Arrêt N63",
    normalizedName: "arret n63",
    rawRefs: ["station:noctilien-63"],
    lineIds: [n63.id],
  };
  const stations = [n62Station, n63Station];
  const lines = [n62, n63];
  return {
    lines,
    stations,
    entrances: [],
    regionalPaths: [],
    pathsById: new Map(),
    linesById: new Map(lines.map((line) => [line.id, line])),
    stationsById: new Map(stations.map((station) => [station.id, station])),
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
}

function createEntry(line: GlobalMapLine): NearbyStationEntry {
  const station = createNetwork(line).stations[0]!;
  return {
    id: station.id,
    station: { ...station, memberStationIds: [station.id] },
    memberStations: [station],
    lines: [line],
    distanceMeters: 300,
    lineDistanceMeters: { [line.id]: 300 },
    insideRadius: true,
  };
}

function createHeavyCandidate(line: GlobalMapLine): NearbyHeavyTransportCandidate {
  const station = createNetwork(line).stations[0]!;
  const entry = createEntry(line);
  const access = { kind: "direct" as const, walkingSeconds: 600, totalSeconds: 900 };
  return {
    id: station.id,
    entry,
    station,
    lines: [line],
    distanceMeters: 2_300,
    access,
    accessByLine: { [line.id]: access },
    projected: true,
  };
}

function readyFrequency(lineId: string): GtfsLineFrequencyResponse {
  return {
    lineId,
    serviceDate: "20260101",
    source: "gtfs",
    status: "ready",
    topologyAvailable: true,
    branched: false,
    average: { peakMinutes: 4 },
    directions: [],
    sections: [],
    stationCount: 10,
    sampledStationCount: 10,
  };
}

describe("useNearbyNeighborhoodScore", () => {
  it("marks a stale backend dataset as degraded without hiding the criterion", async () => {
    const generatedAt = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "1.3",
      generatedAt,
      categories: [{
        id: "security",
        status: "available",
        score: 7.2,
        positiveFacts: [],
        negativeFacts: [],
        neutralFacts: [],
        limitations: [],
      }],
      sources: [],
      warnings: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations: ref<NearbyStationEntry[]>([]),
          network: ref<TransportMapNetwork>(),
          placesProvider,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await vi.waitFor(() => expect(score.criteria.value.find((criterion) => criterion.id === "security")?.status).toBe("degraded"));
    expect(score.criteria.value.find((criterion) => criterion.id === "security")?.datasets)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "neighborhood-verdict", status: "stale" })]));
    wrapper.unmount();
  });

  it("adds frequency details for a new heavy line without refreshing route benchmarks", async () => {
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const line1 = createLine();
    const stations = ref<NearbyStationEntry[]>([createEntry(line1)]);
    const network = ref<TransportMapNetwork>(createNetwork(line1));
    const heavyCandidates = ref<NearbyHeavyTransportCandidate[]>([]);
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    const findJourneys = vi.fn(async () => [] as NearbyJourney[]);
    const fetchFrequency = vi.fn(async (lineId: string) => readyFrequency(lineId));
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          heavyCandidates,
          placesProvider,
          travelRoutesProvider: { findJourneys },
          fetchFrequency,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await vi.waitFor(() => expect(fetchFrequency).toHaveBeenCalledTimes(1));
    const routeCallsBeforeHeavy = findJourneys.mock.calls.length;
    const line2 = { ...createLine(), id: "line:metro:15", code: "15", label: "15" };
    heavyCandidates.value = [createHeavyCandidate(line2)];

    await vi.waitFor(() => expect(fetchFrequency).toHaveBeenCalledTimes(2));
    await flushPromises();
    expect(findJourneys).toHaveBeenCalledTimes(routeCallsBeforeHeavy);
    expect(score.result.value.categories.find((category) => category.id === "transport")).toBeDefined();
    wrapper.unmount();
  });

  it("deduplicates POI loading while adding the Châtelet and frequency stages", async () => {
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const stations = ref<NearbyStationEntry[]>([]);
    const network = ref<TransportMapNetwork>();
    const supermarkets: NearbyPlace[] = [{
      id: "place:supermarket",
      name: "Supermarché test",
      lon: 2.301,
      lat: 48.821,
      category: "shop",
      kind: "supermarket",
      distanceMeters: 200,
    }];
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => supermarkets),
    };
    const journeys: NearbyJourney[] = [{
      id: "journey:chatelet",
      durationSeconds: 25 * 60,
      transferCount: 0,
      sections: [
        { type: "street_network", mode: "walking", durationSeconds: 300 },
        { type: "public_transport", mode: "metro", durationSeconds: 1_200, lineId: "line:metro:4", lineCode: "4" },
      ],
    }];
    const travelRoutesProvider: TravelRoutesProvider = {
      findJourneys: vi.fn(async () => journeys),
    };
    const fetchFrequency = vi.fn(async (lineId: string) => readyFrequency(lineId));
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          journeyDateTime: "20260902T090000",
          placesProvider,
          travelRoutesProvider,
          fetchFrequency,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();
    expect(placesProvider.searchNearby).toHaveBeenCalledTimes(1);

    const line = createLine();
    network.value = createNetwork(line);
    stations.value = [createEntry(line)];
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();

    expect(placesProvider.searchNearby).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(travelRoutesProvider.findJourneys).toHaveBeenCalledTimes(1));
    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledWith(expect.objectContaining({
      datetime: "20260902T090000",
    }), expect.any(AbortSignal));
    expect(fetchFrequency).toHaveBeenCalledTimes(1);
    expect(score.result.value.categories.find((category) => category.id === "transport")?.available).toBe(true);
    wrapper.unmount();
  });

  it("does not cache a failed journey probe as an empty result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: "1.3",
        generatedAt: "20260902T080000",
        categories: [],
        sources: [],
        warnings: [],
      }),
    })));
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const stations = ref<NearbyStationEntry[]>([]);
    const line = createLine();
    const network = ref<TransportMapNetwork>(createNetwork(line));
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    const journeys: NearbyJourney[] = [{
      id: "journey:chatelet-retry",
      durationSeconds: 25 * 60,
      transferCount: 0,
      sections: [{
        type: "public_transport",
        mode: "metro",
        durationSeconds: 25 * 60,
        lineId: line.id,
        lineCode: line.code,
        lineMode: line.mode,
      }],
    }];
    const findJourneys = vi.fn()
      .mockRejectedValueOnce(new Error("navitia-journeys-429"))
      .mockResolvedValue(journeys) as TravelRoutesProvider["findJourneys"];
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          journeyDateTime: "20260902T090000",
          placesProvider,
          travelRoutesProvider: { findJourneys },
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await vi.waitFor(() => expect(findJourneys).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(score.error.value).toBeInstanceOf(Error));
    expect(score.errorSource.value).toBe("routes");
    await score.refresh();
    await vi.waitFor(() => expect(findJourneys).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(score.result.value.positiveFacts.some((fact) => fact.kind === "chateletUnder30")).toBe(true));
    expect(score.error.value).toBeUndefined();
    expect(score.errorSource.value).toBeUndefined();

    wrapper.unmount();
  });

  it("aborts origin-scoped probes when a refresh replaces the origin", async () => {
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const line = createLine();
    const stations = ref<NearbyStationEntry[]>([]);
    const network = ref<TransportMapNetwork>(createNetwork(line));
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    const signals: AbortSignal[] = [];
    const findJourneys: TravelRoutesProvider["findJourneys"] = vi.fn((_, signal) => new Promise<NearbyJourney[]>((resolve, reject) => {
      if (!signal) {
        resolve([]);
        return;
      }
      signals.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("aborted", "AbortError")), { once: true });
    }));
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          placesProvider,
          travelRoutesProvider: { findJourneys },
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await vi.waitFor(() => expect(findJourneys).toHaveBeenCalledTimes(1));
    expect(signals[0]?.aborted).toBe(false);
    origin.value = { lon: 2.36, lat: 48.86, label: "Nouvelle origine" };

    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
    expect(score.isLoading.value).toBe(true);
    wrapper.unmount();
  });

  it("keeps multiple Noctilien lines when scheduled journeys have no Navitia id", async () => {
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const stations = ref<NearbyStationEntry[]>([]);
    const network = ref<TransportMapNetwork>(createNoctilienNetwork());
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    const travelRoutesProvider: TravelRoutesProvider = {
      findJourneys: vi.fn(async (request): Promise<NearbyJourney[]> => [{
        durationSeconds: 7 * 60,
        sections: [
          { type: "street_network", mode: "walking", durationSeconds: request.destination.id.endsWith("62") ? 300 : 360 },
          {
            type: "public_transport",
            mode: "bus",
            durationSeconds: 60,
            lineCode: request.destination.id.endsWith("62") ? "N62" : "N63",
            lineMode: "NOCTILIEN",
          },
        ],
      }]),
    };
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          journeyDateTime: "20260902T090000",
          nightJourneyDateTime: "20260902T030000",
          placesProvider,
          travelRoutesProvider,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await vi.waitFor(() => {
      const fact = score.result.value.categories
        .find((category) => category.id === "transport")
        ?.positiveFacts.find((candidate) => candidate.kind === "noctilienAtNight");
      expect(fact?.labelValues).toMatchObject({ line: "N62 et N63", minutes: 6 });
    });
    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("does not use a bootstrap bus stop as Châtelet and invalidates a stale target route", async () => {
    const origin = ref({ lon: 2.30, lat: 48.82, label: "Origine" });
    const stations = ref<NearbyStationEntry[]>([]);
    const network = ref<TransportMapNetwork>(createNetwork({
      ...createLine(),
      id: "line:bus:les-halles",
      code: "38",
      label: "38",
      mode: "BUS",
    }));
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    const journeys: NearbyJourney[] = [{
      id: "journey:chatelet",
      durationSeconds: 20 * 60,
      transferCount: 0,
      sections: [{
        type: "public_transport",
        mode: "metro",
        durationSeconds: 20 * 60,
        lineId: "line:metro:4",
        lineCode: "4",
        lineMode: "METRO",
      }],
    }];
    const travelRoutesProvider: TravelRoutesProvider = {
      findJourneys: vi.fn(async (request) => request.destination.lon < 2.34
        ? [{ ...journeys[0]!, durationSeconds: 181 * 60 }]
        : journeys),
    };
    const fetchFrequency = vi.fn(async (lineId: string) => readyFrequency(lineId));
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          journeyDateTime: "20260902T090000",
          placesProvider,
          travelRoutesProvider,
          fetchFrequency,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();
    expect(travelRoutesProvider.findJourneys).not.toHaveBeenCalled();

    network.value = createNetwork(createLine(), { lon: 2.33, lat: 48.858 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();

    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledTimes(1);
    expect(score.result.value.negativeFacts.some((fact) => fact.kind === "chateletOver60")).toBe(true);

    network.value = createNetwork(createLine(), { lon: 2.347, lat: 48.8617 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();

    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledTimes(2);
    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledWith(expect.objectContaining({
      destination: expect.objectContaining({ lon: 2.347, lat: 48.8617 }),
    }), expect.any(AbortSignal));
    expect(score.result.value.negativeFacts.some((fact) => fact.kind === "chateletOver60")).toBe(false);
    expect(score.result.value.positiveFacts.some((fact) => fact.kind === "chateletUnder30")).toBe(true);
    wrapper.unmount();
  });

  it("uses the shared route probe for a large green space beyond the walking limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
      schemaVersion: "1.3",
        generatedAt: "2026-09-04T00:00:00.000Z",
        categories: [],
        sources: [],
        warnings: [],
        nearbyGreenSpaces: [{
          id: "green-domaine",
          name: "Domaine de Sceaux",
          category: "Parc",
          surfaceM2: 1_654_972,
          lon: 2.28665,
          lat: 48.771,
          distanceMeters: 1_581,
          walkingMinutes: 28,
          estimatedWalkingMinutes: 20,
        }],
      }),
    })));
    const origin = ref({ lon: 2.267785, lat: 48.764151, label: "Appart V2" });
    const stations = ref<NearbyStationEntry[]>([]);
    const network = ref<TransportMapNetwork>();
    const placesProvider: PlacesProvider = {
      searchDestinations: vi.fn(async () => []),
      searchNearby: vi.fn(async () => []),
    };
    const greenJourney: NearbyJourney = {
      id: "journey:domaine-t10",
      durationSeconds: 17 * 60,
      sections: [
        { type: "street_network", mode: "walking", durationSeconds: 120 },
        { type: "waiting", durationSeconds: 3 * 60 },
        { type: "public_transport", mode: "tram", durationSeconds: 12 * 60, lineCode: "T10", lineMode: "TRAM" },
      ],
    };
    const travelRoutesProvider: TravelRoutesProvider = {
      findJourneys: vi.fn(async (request) => request.destination.id.startsWith("green-space:")
        ? [greenJourney]
        : []),
    };
    let score!: ReturnType<typeof useNearbyNeighborhoodScore>;
    const Harness = defineComponent({
      setup() {
        score = useNearbyNeighborhoodScore({
          origin,
          stations,
          network,
          journeyDateTime: "20260907T090000",
          placesProvider,
          travelRoutesProvider,
        });
        return () => null;
      },
    });
    const wrapper = mount(Harness);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await flushPromises();

    expect(travelRoutesProvider.findJourneys).toHaveBeenCalledWith(expect.objectContaining({
      destination: expect.objectContaining({ id: expect.stringMatching(/^green-space:green-domaine:/u) }),
      datetime: "20260907T090000",
    }), expect.any(AbortSignal));
    expect(score.result.value.categories
      .find((category) => category.id === "nature-leisure")
      ?.positiveFacts.some((fact) => fact.kind === "greenSpaceTransitNearby" && fact.labelValues?.lines === "T10"))
      .toBe(true);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
