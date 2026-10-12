import { describe, expect, it } from "vitest";
import { buildJourneyBenchmarkFacts } from "../src/features/nearby-stations/neighborhood/criteria/transport/benchmarks";
import { EMPLOYMENT_HUB_BENCHMARKS, resolveReferenceBenchmarkDestinations } from "../src/features/nearby-stations/neighborhood/criteria/transport/majorStationBenchmarks";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { buildNeighborhoodScore } from "../src/features/nearby-stations/neighborhood";
import type { NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood/contracts";
const journey = { source: "gtfs" as const, durationSeconds: 2400, sections: [{ type: "walking", durationSeconds: 600 }, { type: "waiting", durationSeconds: 300 }, { type: "public_transport", durationSeconds: 1500, lineCode: "A", lineMode: "RER" as const }] };
const input: NeighborhoodScoreInput = { places: [], placesLoaded: false, stations: [], stationsLoaded: true, generatedAt: 1,
  journeyBenchmarksLoading: false, journeyBenchmarks: EMPLOYMENT_HUB_BENCHMARKS.map(hub => ({ id: hub.id, label: hub.label, stationLabel: "Gare réelle du catalogue", journeys: [journey], status: "ready" })) };
describe("employment travel references", () => {
  it("resolves coordinates and official references from heavy stations without matching unrelated names", () => {
    const stations = [
      { id: "real", name: "Val de Fontenay", aliases: [], rawRefs: ["stop_area:IDFM:123"], lineIds: ["rer"], isHub: true, lon: 2.47, lat: 48.86 },
      { id: "wrong", name: "Avenue du Val de Fontenay", aliases: [], rawRefs: ["stop_area:IDFM:456"], lineIds: ["rer"], isHub: true, lon: 2.5, lat: 48.9 },
      { id: "bus", name: "Val de Fontenay", aliases: [], rawRefs: ["stop_area:IDFM:789"], lineIds: ["bus"], isHub: true, lon: 2.6, lat: 48.95 },
    ];
    const network = { stations, linesById: new Map([["rer", { mode: "RER" }], ["bus", { mode: "BUS" }]]) } as unknown as TransportMapNetwork;
    expect(resolveReferenceBenchmarkDestinations(network)).toEqual([{ id: "employment-val-de-fontenay", label: "Val de Fontenay", stationLabel: "Val de Fontenay", lon: 2.47, lat: 48.86, destinationRef: "stop_area:IDFM:123" }]);
  });
  it("keeps every job hub neutral, includes walking and removes only the initial wait", () => {
    const facts = buildJourneyBenchmarkFacts(input);
    expect(facts.positiveFacts).toHaveLength(0);
    const jobs = facts.neutralFacts.filter(fact => fact.kind === "employmentHubContext");
    expect(jobs).toHaveLength(4);
    expect(jobs.every(fact => fact.polarity === "neutral" && !fact.emphasis)).toBe(true);
    expect(jobs[0]?.tooltipValues).toMatchObject({ duration: 35, elapsed: 40, walking: 10, initialWait: 5, station: "Gare réelle du catalogue" });
    expect(jobs[0]?.tooltipKey).toBe("nearbyStations.neighborhoodScore.gtfsFacts.employmentHub");
    const result = buildNeighborhoodScore(input);
    expect(result.categories.find(category => category.id === "transport")?.neutralFacts.filter(fact => fact.family.startsWith("employment-hub:"))).toHaveLength(4);
    expect(result.score).toBe(buildNeighborhoodScore({ ...input, journeyBenchmarks: [] }).score);
  });
  it("reports missing hub data without inventing times or a score", () => {
    const facts = buildJourneyBenchmarkFacts({ ...input, journeyBenchmarks: [] });
    expect(facts.neutralFacts.filter(fact => fact.kind === "employmentHubUnavailable")).toHaveLength(4);
    expect(facts.positiveFacts).toHaveLength(0);
  });
});
