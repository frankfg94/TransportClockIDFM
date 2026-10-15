import type { NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { summarizeJourney } from "../journeys";
import { normalizeScoreText } from "../primitives";
import { coLocatedCurrentLines, formatTransportLineName, journeySectionMatchesLine, lineKey, NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS, NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS, transportLineReferencesMatch, transportAccessSignalKey, type NeighborhoodTransportAccessSignal } from "./heavyTransports";
import { commercialDistanceMeters } from "../places";
import type { GlobalMapLine } from "../../../transport-map/contracts/manifest";
import type { PublicFutureGpeStation } from "../../neighborhoodVerdictApi";
import { normalizeStationName } from "../../neighborhoodStationReferences";
import { isNearbyJourneyTransitSection } from "../../nearbyJourneyTiming";

const TRANSPORT_HUB_EXCEPTIONAL_MAX_MINUTES = 10;

interface GpeExpressFactsContext {
  coLocatedFutureProjects: { project: PublicFutureGpeStation; currentLines: GlobalMapLine[] }[];
  accessibleSignals: NeighborhoodTransportAccessSignal[];
  routedFutureAccessSignals: NeighborhoodTransportAccessSignal[];
}

function sameFinalStation(signal: NeighborhoodTransportAccessSignal, project: PublicFutureGpeStation): boolean {
  if (!signal.station) return false;
  const distance = commercialDistanceMeters(signal.station, project);
  return distance <= 100 || distance <= 250 && normalizeStationName(signal.station.name) === normalizeStationName(project.name);
}

export function buildGpeExpressContext(input: NeighborhoodScoreInput, accessSignals: NeighborhoodTransportAccessSignal[], accessibleLineKeys: Set<string>) {
  const routedFutureAccessSignals = accessSignals.filter((signal) =>
    signal.source === "route" && signal.futureProject);
  const futureProjects = input.backendVerdict?.futureProjects ?? [];
  // The verdict keeps nearby GPE stations with a real walking route even
  // when that walking leg exceeds 15 minutes. Such a station can still be a
  // valid future hub when it is co-located with an accessible current line.
  const routedFutureProjects = futureProjects.filter((project) =>
    Number.isFinite(project.walkingMinutes) && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) >= 0);
  const accessibleFutureProjects = futureProjects.filter((project) =>
    Number.isFinite(project.walkingMinutes) && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) <= 15);
  const resolverFutureProjects = routedFutureAccessSignals
    .map((signal) => signal.futureProject!);
  const allRoutedFutureProjects = [...new Map([
    ...routedFutureProjects.map((project) => [project.id, project] as const),
    ...resolverFutureProjects.map((project) => [project.id, project] as const),
  ]).values()];
  const coLocatedFutureProjects = allRoutedFutureProjects.map((project) => {
    const currentKeys = new Set(accessibleLineKeys);
    // A real approach to this future hub proves its current interchange even
    // when the first access to that current line exceeds the 15-minute bonus.
    const approach = routedFutureAccessSignals.find(signal => signal.futureProject?.id === project.id);
    const arrival = approach?.journey?.sections.filter(isNearbyJourneyTransitSection).at(-1);
    if (arrival) {
      for (const candidate of input.heavyCandidates ?? []) {
        if (!Object.values(candidate.futureProjectsByLine ?? {}).some(value => value.id === project.id)) continue;
        for (const line of candidate.coLocatedHeavyLines ?? []) {
          if (journeySectionMatchesLine(arrival, line)) currentKeys.add(lineKey(line));
        }
      }
    }
    const currentLines = coLocatedCurrentLines(input, project, currentKeys).filter(line => {
      if (!approach || (project.walkingMinutes ?? Infinity) <= 15) return true;
      // A route to the hub's current rail platform does not also prove access
      // to every other co-located line at that same duration. Keep those lines'
      // own final footpaths unless an independent access is already as fast.
      return Boolean(arrival && journeySectionMatchesLine(arrival, line))
        || accessSignals.some(signal => !signal.futureProject && signal.contributionWeight !== 0 && lineKey(signal.line) === lineKey(line)
          && sameFinalStation(signal, project) && signal.travelSeconds <= approach.travelSeconds);
    });
    return { project, currentLines };
  }).filter((candidate) => candidate.currentLines.length > 0);
  const effectiveFutureProjects = [...new Map([
    ...accessibleFutureProjects.map((project) => [project.id, project] as const),
    ...coLocatedFutureProjects.filter(({ project }) =>
      routedFutureAccessSignals.some(signal => signal.futureProject?.id === project.id
        && signal.travelSeconds <= NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS)
      || accessSignals.some(signal => signal.contributionWeight !== 0 && sameFinalStation(signal, project)
        && signal.travelSeconds <= NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS))
      .map(({ project }) => [project.id, project] as const),
  ]).values()];
  const futureLineKeys = new Set(effectiveFutureProjects.map((project) => `future:${normalizeScoreText(project.line)}`));
  // Suppress an access only after its combined fact has actually been built.
  const context = { routedFutureAccessSignals, coLocatedFutureProjects, effectiveFutureProjects, futureLineKeys };
  const hubs = buildGpeExpressFacts({ ...context, accessibleSignals: accessSignals.filter(signal => signal.contributionWeight !== 0 && signal.travelSeconds <= NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS) });
  const displayedProjects = new Map(hubs.map(fact => [fact.id, fact]));
  const hubCoveredAccessKeys = new Set(coLocatedFutureProjects.flatMap(({ project, currentLines }) => {
    const hub = displayedProjects.get(`transport-hub-${normalizeScoreText(project.id).replace(/[^a-z0-9]+/gu, "-")}`);
    return hub ? accessSignals.filter(signal =>
      signal.futureProject?.id === project.id || hub.polarity === "positive" && sameFinalStation(signal, project)
        && (currentLines.some(line => lineKey(line) === lineKey(signal.line)) || transportLineReferencesMatch(signal.line.code || signal.line.label, project.line)),
    ).map(transportAccessSignalKey) : [];
  }));
  return { ...context, hubCoveredAccessKeys };
}

export function buildGpeExpressFacts(context: GpeExpressFactsContext) {
  const { coLocatedFutureProjects, accessibleSignals, routedFutureAccessSignals } = context;
  const positiveFacts: NeighborhoodFact[] = [];
  for (const { project, currentLines } of coLocatedFutureProjects) {
    const currentLineNames = currentLines.map((line) => formatTransportLineName(line));
    if (currentLineNames.length === 0) continue;
    const matchingAccess = accessibleSignals.find((signal) =>
      sameFinalStation(signal, project)
      && currentLines.some((line) => lineKey(line) === lineKey(signal.line)));
    const futureAccess = routedFutureAccessSignals.find((signal) =>
      signal.futureProject?.id === project.id);
    const walkingMinutes = Number.isFinite(project.walkingMinutes)
      && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) <= 15
      ? project.walkingMinutes
      : undefined;
    const routeAccess = walkingMinutes === undefined ? futureAccess ?? matchingAccess : undefined;
    // A project beyond the walking threshold must be backed by a real route
    // to the current line; a map-distance estimate is not enough to create a
    // future transport hub.
    const transitMinutes = routeAccess?.source === "route"
      ? routeAccess.minutes
      : undefined;
    const minutes = walkingMinutes ?? transitMinutes;
    if (!minutes) continue;
    const contextOnly = routeAccess !== undefined && routeAccess.travelSeconds > NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS;
    const routeJourneySummary = routeAccess?.journey ? summarizeJourney(routeAccess.journey) : undefined;
    const hasRouteTransfer = (routeJourneySummary?.transfers ?? 0) > 0;
    const via = walkingMinutes !== undefined
      ? "à pied"
      : routeAccess?.source === "route" && routeAccess.via
      ? routeAccess.via
      : currentLineNames[0];
    positiveFacts.push(makeFact({
      id: `transport-hub-${normalizeScoreText(project.id).replace(/[^a-z0-9]+/gu, "-")}`,
      kind: "transportHub",
      category: "transport",
      polarity: contextOnly ? "neutral" : "positive",
      family: `transport-hub:${project.hubId ?? project.id}`,
      priority: 14,
      values: {
        currentLines: currentLineNames.join(" et "),
        futureLine: project.line,
        minutes,
        via,
        station: project.name,
      },
      sourceKey: SOURCE_KEYS.heavyRoutes,
      proof: "direct",
      ruleKey: contextOnly ? "nearbyStations.neighborhoodScore.rules.transportHubContext" : RULE_KEYS.transportHub,
      ruleValues: {
        threshold: futureAccess
          ? NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS / 60
          : NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS / 60,
      },
      emphasis: contextOnly ? undefined : "exceptional",
      markerEmphasis: hasRouteTransfer && minutes > TRANSPORT_HUB_EXCEPTIONAL_MAX_MINUTES
        ? "standard"
        : undefined,
      travel: routeAccess?.journey ? { journey: routeAccess.journey } : undefined,
    }));
  }

  return positiveFacts;
}
