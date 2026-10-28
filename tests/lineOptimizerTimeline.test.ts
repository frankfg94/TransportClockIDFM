import { describe, expect, it, vi } from "vitest";
import { createLineOptimizerTimeline } from "../src/features/line-optimizer/lineOptimizerTimeline";
import { createGlobalTransportItinerarySegments } from "../src/features/line-map/globalTransportItineraryGeometry";
import {
  optimizerDestination,
  optimizerItineraryCandidate,
  optimizerOrigin,
} from "./fixtures/optimizerItinerary";

describe("optimizer shared timeline and map model", () => {
  it("uses selected courses, stops, and exact connection steps instead of discovery timings", () => {
    const candidate = optimizerItineraryCandidate();
    const timeline = createLineOptimizerTimeline(candidate, optimizerOrigin, optimizerDestination);
    expect(timeline.steps.map((s) => s.kind)).toEqual([
      "preparation",
      "walk",
      "transit",
      "walk",
      "wait",
      "transit",
      "walk",
      "wait",
      "transit",
      "walk",
    ]);
    expect(timeline.route.durationSeconds).toBe(2460);
    expect(timeline.steps.reduce((sum, s) => sum + s.durationSeconds, 0)).toBe(2460);
    expect(
      timeline.steps
        .filter((s) => s.kind === "wait")
        .reduce((sum, s) => sum + s.durationSeconds, 0),
    ).toBe(candidate.totalWaitSeconds);
    timeline.steps.forEach((step, i) => {
      expect(step.section).toBe(timeline.route.sections[i]);
      expect(step.section.departureDateTime).toBe(new Date(step.startAt).toISOString());
      if (i) expect(step.startAt).toBe(timeline.steps[i - 1]!.endAt);
    });
    timeline.transitSteps.forEach((step, i) => {
      expect(step.section).toBe(timeline.route.transitSections[i]);
      expect(step.section.stopNames).toBe(candidate.courses[i]!.stopNames);
      expect(step.startAt).toBe(candidate.courses[i]!.departure);
      expect(step.endAt).toBe(candidate.courses[i]!.arrival);
      expect(step.section.geometry).toBe(candidate.route.transitSections[i]!.geometry);
    });
    timeline.connections.flat().forEach((step) => expect(timeline.steps).toContain(step));
  });
  it("omits zero walks and waits and retains immediate boarding", () => {
    const candidate = optimizerItineraryCandidate();
    candidate.walkSeconds = 0;
    candidate.walkAt = candidate.courses[0]!.departure;
    candidate.waits[1] = 0;
    const timeline = createLineOptimizerTimeline(candidate, optimizerOrigin, optimizerDestination);
    expect(timeline.steps.find((s) => s.kind === "walk" && s.courseIndex === 0)).toBeUndefined();
    expect(timeline.connections[1]!.map((s) => s.kind)).toEqual(["walk"]);
    expect(timeline.steps.find((s) => s.kind === "wait" && s.courseIndex === 0)).toBeUndefined();
  });
  it("uses supplied vertices when detailed line geometry is unavailable, without changing walking exits", () => {
    const candidate = optimizerItineraryCandidate();
    const timeline = createLineOptimizerTimeline(candidate, optimizerOrigin, optimizerDestination);
    const resolveTransitGeometry = vi.fn();
    const resolveTransitExitPoint = vi.fn();
    const segments = createGlobalTransportItinerarySegments(
      timeline.route,
      optimizerOrigin,
      optimizerDestination,
      {
        preserveSections: true,
        resolveTransitGeometry,
        resolveTransitExitPoint,
      },
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "walking",
      "transit",
      "walking",
      "transit",
      "walking",
      "transit",
      "walking",
    ]);
    expect(segments[1]!.coordinates).toBe(candidate.route.transitSections[0]!.geometry);
    expect(segments[0]!.coordinates).toEqual(candidate.route.sections[0]!.geometry);
    expect(resolveTransitGeometry).toHaveBeenCalledTimes(candidate.courses.length);
    expect(resolveTransitExitPoint).not.toHaveBeenCalled();
  });
});
