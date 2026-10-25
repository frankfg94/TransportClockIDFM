import type { LineOptimizerCandidate } from "../../src/features/line-optimizer/lineOptimizer";
import type { NearbyJourneySection } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import type { GeocoderPoint } from "../../src/features/transport-map/contracts/geocoder";

export const optimizerOrigin: GeocoderPoint = { label: "Origine A", lon: 2.2, lat: 48.8 };
export const optimizerDestination: GeocoderPoint = {
  label: "Destination A",
  lon: 2.35,
  lat: 48.86,
};
export function optimizerItineraryCandidate(): LineOptimizerCandidate {
  const base = Date.parse("2026-10-22T08:00:00Z");
  const at = (seconds: number) => base + seconds * 1000;
  const points = [
    optimizerOrigin,
    { lon: 2.21, lat: 48.801 },
    { lon: 2.22, lat: 48.81 },
    { lon: 2.221, lat: 48.811 },
    { lon: 2.25, lat: 48.8 },
    { lon: 2.251, lat: 48.801 },
    { lon: 2.349, lat: 48.859 },
    optimizerDestination,
  ];
  const sections: NearbyJourneySection[] = points.slice(1).map((point, i) => ({
    type: i % 2 ? "public_transport" : "street_network",
    mode: i % 2 ? undefined : "walking",
    ...(i % 2
      ? ({ lineCode: ["T6", "T10", "B"][(i - 1) / 2], lineMode: i === 5 ? "RER" : "TRAM" } as const)
      : {}),
    fromName: `Station ${i}`,
    toName: `Station ${i + 1}`,
    fromPoint: points[i],
    toPoint: point,
    geometry: [points[i]!, point],
    durationSeconds: 999,
    departureDateTime: "2000-01-01T00:00:00Z",
    stopNames: i % 2 ? ["Discovery stop"] : undefined,
  }));
  const courses = [
    [150, 450],
    [600, 1200],
    [1500, 2400],
  ].map(([departure, arrival], i) => ({
    id: `course-${i}`,
    departure: at(departure!),
    arrival: at(arrival!),
    baseDeparture: at(departure!),
    baseArrival: at(arrival!),
    source: "schedule" as const,
    stopNames: [`Selected stop ${i}`, `Selected destination ${i}`],
    direction: `Direction ${i}`,
  }));
  return {
    id: "selected-a",
    route: {
      id: "discovery",
      sections,
      transitSections: sections.filter((s) => s.lineMode),
      durationSeconds: 9999,
    },
    courses,
    waits: [0, 30, 120],
    totalWaitSeconds: 150,
    corridorIndex: 1,
    tram: courses[1]!,
    train: courses[2]!,
    leaveAt: at(0),
    walkAt: at(60),
    platformAt: at(1380),
    arriveAt: at(2460),
    walkSeconds: 90,
    transferSeconds: 180,
    providerWalkSeconds: 999,
    providerTransferSeconds: 999,
    waitSeconds: 120,
  };
}
