import type { NearbyJourneySection } from "../nearby-stations/nearbyHeavyTransports";
import { isTurboTransit } from "../nearby-stations/travelTurbo";
import { isNearbyJourneyWaitingSection } from "../nearby-stations/nearbyJourneyTiming";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalTransportItineraryStep } from "../line-map/globalTransportPlanItinerary";
import { optimizerConnectionSteps, type LineOptimizerCandidate } from "./lineOptimizer";

/** One projection of the selected candidate for BOTH the timeline and the map.
 * Discovery timings and waits are replaced by the optimizer's selected courses.
 * Geometry is retained from discovery; no routing/provider is called here. */
export function createLineOptimizerTimeline(
  candidate: LineOptimizerCandidate,
  origin?: GeocoderPoint,
  destination?: GeocoderPoint,
) {
  const routeId = `optimizer:${candidate.id}`;
  const steps: GlobalTransportItineraryStep[] = [];
  const transitIndices = candidate.route.sections.flatMap((section, index) =>
    isTurboTransit(section) ? [index] : [],
  );
  const legs = candidate.courses.map((course, index): NearbyJourneySection => ({
    ...candidate.route.transitSections[index]!,
    durationSeconds: (course.arrival - course.departure) / 1000,
    departureDateTime: new Date(course.departure).toISOString(),
    arrivalDateTime: new Date(course.arrival).toISOString(),
    vehicleJourneyId: course.vehicleJourneyId,
    timingSource: course.source,
    direction: course.direction ?? candidate.route.transitSections[index]?.direction,
    mission: course.mission ?? candidate.route.transitSections[index]?.mission,
    stopNames: course.stopNames ?? candidate.route.transitSections[index]?.stopNames,
    serviceType: course.serviceType ?? candidate.route.transitSections[index]?.serviceType,
  }));
  function append(
    kind: GlobalTransportItineraryStep["kind"],
    startAt: number,
    endAt: number,
    section: NearbyJourneySection,
    courseIndex?: number,
  ) {
    steps.push({
      id: `${routeId}:${steps.length}`,
      kind,
      startAt,
      endAt,
      durationSeconds: (endAt - startAt) / 1000,
      courseIndex,
      section: {
        ...section,
        durationSeconds: (endAt - startAt) / 1000,
        departureDateTime: new Date(startAt).toISOString(),
        arrivalDateTime: new Date(endAt).toISOString(),
      },
    });
  }
  function walkingSection(beforeIndex: number, afterIndex: number): NearbyJourneySection {
    const source = candidate.route.sections
      .slice(beforeIndex + 1, afterIndex)
      .filter((section) => !isTurboTransit(section) && !isNearbyJourneyWaitingSection(section));
    const geometry = source.flatMap((section) => section.geometry ?? []);
    const previous = candidate.route.sections[beforeIndex];
    const next = candidate.route.sections[afterIndex];
    return {
      type: "street_network",
      mode: "walking",
      durationSeconds: 0,
      fromName: previous?.toName ?? origin?.label,
      toName: next?.fromName ?? destination?.label,
      fromPoint: previous?.toPoint ?? origin,
      toPoint: next?.fromPoint ?? destination,
      ...(geometry.length >= 2 ? { geometry } : {}),
    };
  }
  append("preparation", candidate.leaveAt, candidate.walkAt, {
    type: "preparation",
    durationSeconds: 0,
    fromPoint: origin,
    toPoint: origin,
    fromName: origin?.label,
    toName: origin?.label,
  });
  if (candidate.walkSeconds > 0) {
    append(
      "walk",
      candidate.walkAt,
      candidate.courses[0]!.departure,
      walkingSection(-1, transitIndices[0]!),
      0,
    );
  }
  const connections = candidate.courses.map((_, index) => {
    const sharedSteps: GlobalTransportItineraryStep[] = [];
    const connection = optimizerConnectionSteps(candidate, index);
    for (const step of connection) {
      const section =
        step.kind === "walk"
          ? walkingSection(transitIndices[index - 1]!, transitIndices[index]!)
          : {
              type: "waiting",
              durationSeconds: step.durationSeconds,
              fromPoint: legs[index]?.fromPoint,
              toPoint: legs[index]?.fromPoint,
              fromName: legs[index]?.fromName,
              toName: legs[index]?.fromName,
            };
      append(step.kind, step.startAt, step.endAt, section, index);
      sharedSteps.push(steps.at(-1)!);
    }
    const course = candidate.courses[index]!;
    append("transit", course.departure, course.arrival, legs[index]!, index);
    return sharedSteps;
  });
  const lastCourse = candidate.courses.at(-1)!;
  if (candidate.arriveAt > lastCourse.arrival) {
    append(
      "walk",
      lastCourse.arrival,
      candidate.arriveAt,
      walkingSection(transitIndices.at(-1)!, candidate.route.sections.length),
    );
  }
  const sections = steps.map((step) => step.section);
  const route: TravelRoute = {
    ...candidate.route,
    id: routeId,
    sections,
    transitSections: sections.filter(isTurboTransit),
    departureDateTime: new Date(candidate.leaveAt).toISOString(),
    arrivalDateTime: new Date(candidate.arriveAt).toISOString(),
    durationSeconds: (candidate.arriveAt - candidate.leaveAt) / 1000,
  };
  return {
    steps,
    route,
    connections,
    transitSteps: steps.filter((step) => step.kind === "transit"),
  };
}
