import type { NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { summarizeJourney } from "../journeys";
import { normalizeScoreText } from "../primitives";
import { coLocatedCurrentLines, formatTransportLineName, lineKey, NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS, NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS, transportLineReferencesMatch, type NeighborhoodTransportAccessSignal } from "./heavyTransports";
import type { TransportFactsContext } from "./context";

const TRANSPORT_HUB_EXCEPTIONAL_MAX_MINUTES = 10;

export function buildGpeExpressContext(input: NeighborhoodScoreInput, accessSignals: NeighborhoodTransportAccessSignal[], accessibleLineKeys: Set<string>) {
  const routedFutureAccessSignals = accessSignals.filter((signal) =>
    signal.source === "route" && signal.futureProject
    && signal.travelSeconds < NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS);
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
  const coLocatedFutureProjects = allRoutedFutureProjects.map((project) => ({
    project,
    currentLines: coLocatedCurrentLines(input, project, accessibleLineKeys),
  })).filter((candidate) => candidate.currentLines.length > 0);
  const effectiveFutureProjects = [...new Map([
    ...accessibleFutureProjects.map((project) => [project.id, project] as const),
    ...coLocatedFutureProjects.map(({ project }) => [project.id, project] as const),
  ]).values()];
  const futureLineKeys = new Set(effectiveFutureProjects.map((project) => `future:${normalizeScoreText(project.line)}`));
  const knownTransportLines = [
    ...input.stations.flatMap((entry) => entry.lines),
    ...(input.heavyCandidates ?? []).flatMap((candidate) => candidate.lines),
  ];
  const hubCoveredLineKeys = new Set(coLocatedFutureProjects.flatMap(({ project, currentLines }) => [
    ...currentLines.map((line) => lineKey(line)),
    ...knownTransportLines
      .filter((line) => transportLineReferencesMatch(line.code || line.label, project.line))
      .map((line) => lineKey(line)),
    ...accessSignals
      .filter((signal) => signal.futureProject?.id === project.id)
      .map((signal) => lineKey(signal.line)),
  ]));
  return { routedFutureAccessSignals, coLocatedFutureProjects, effectiveFutureProjects, futureLineKeys, hubCoveredLineKeys };
}

export function buildGpeExpressFacts(context: TransportFactsContext) {
  const { coLocatedFutureProjects, accessibleSignals, routedFutureAccessSignals } = context;
  const positiveFacts: NeighborhoodFact[] = [];
  for (const { project, currentLines } of coLocatedFutureProjects) {
    const currentLineNames = currentLines.map((line) => formatTransportLineName(line));
    if (currentLineNames.length === 0) continue;
    const matchingAccess = accessibleSignals.find((signal) =>
      currentLines.some((line) => lineKey(line) === lineKey(signal.line)));
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
      polarity: "positive",
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
      ruleKey: RULE_KEYS.transportHub,
      ruleValues: {
        threshold: futureAccess
          ? NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS / 60
          : NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS / 60,
      },
      emphasis: "exceptional",
      markerEmphasis: hasRouteTransfer && minutes > TRANSPORT_HUB_EXCEPTIONAL_MAX_MINUTES
        ? "standard"
        : undefined,
      travel: routeAccess?.journey ? { journey: routeAccess.journey } : undefined,
    }));
  }

  return positiveFacts;
}
