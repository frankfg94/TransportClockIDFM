import { describe, expect, it } from "vitest";
import { journeyPreviewRow } from "../src/features/nearby-stations/neighborhood/journeyPreview";
import type { NearbyJourneySection } from "../src/features/nearby-stations/nearbyHeavyTransports";

const from = { lat: 48.798965, lon: 2.279473 };
const to = { lat: 48.85, lon: 2.33 };
const destination = { id: "montparnasse", label: "Gare Montparnasse", journeys: [], failed: false };
const route = (sections: NearbyJourneySection[]) => ({ ...destination, status: "ready" as const, journeys: [{ durationSeconds: 540, sections }] });

describe("Verdict journey preview evidence", () => {
  it("shows actual endpoints as points without inferring a connecting segment", () => {
    const data = route([{ type: "public_transport", durationSeconds: 540, fromPoint: from, toPoint: to }]);
    expect(journeyPreviewRow(data)).toMatchObject({ status: "missingGeometry", paths: [], points: [from, to], summary: { elapsedMinutes: 9 } });
  });

  it("renders only explicit paths, leaves unknown legs as points and skips waiting", () => {
    const geometry = [from, { lat: 48.83, lon: 2.32 }, to];
    expect(journeyPreviewRow(route([
      { type: "waiting", durationSeconds: 180 },
      { type: "walking", durationSeconds: 60, geometry: [from, to], walkingProvider: "straight-line", fromPoint: from },
      { type: "public_transport", durationSeconds: 300, geometry },
    ]))).toMatchObject({ status: "partialGeometry", paths: [{ kind: "transit", coordinates: geometry }], points: [from] });
    expect(journeyPreviewRow(route([{ type: "public_transport", durationSeconds: 540, geometry }])).status).toBe("ready");
  });

  it("distinguishes pending, no result and failed probes", () => {
    expect(journeyPreviewRow({ ...destination, status: "loading" }).status).toBe("loading");
    expect(journeyPreviewRow({ ...destination, status: "unavailable" }).status).toBe("unavailable");
    expect(journeyPreviewRow({ ...destination, status: "unavailable", failed: true }).status).toBe("error");
  });

  it("shows the selected alternative on its mapped line and retains stop markers across a map gap", () => {
    const first = route([{ type: "walking", durationSeconds: 80, fromPoint: from, toPoint: to }]);
    const rail = { type: "public_transport", durationSeconds: 600, fromPoint: from, toPoint: to };
    const alternative = { durationSeconds: 600, sections: [rail] };
    first.journeys.push(alternative);
    const shape = [from, { lat: 48.83, lon: 2.3 }, to];
    expect(journeyPreviewRow(first, alternative, () => shape)).toMatchObject({ selectedIndex: 1, paths: [{ kind: "transit", coordinates: shape }], summary: { elapsedMinutes: 10 } });
    expect(journeyPreviewRow(first, alternative, () => [])).toMatchObject({ paths: [], points: [from, to] });
  });
});
