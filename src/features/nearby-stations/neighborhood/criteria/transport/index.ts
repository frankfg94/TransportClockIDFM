import type { GlobalMapLine } from "../../../../transport-map/contracts/manifest";
import type { NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodScoreInput } from "../../contracts";
import { EARLY_LAST_SERVICE_CUTOFF_SECONDS, getNeighborhoodFrequencyLowThreshold, HEAVY_SCORE_MODES, NEIGHBORHOOD_FREQUENCY_CONTEXT_MAX_SECONDS } from "../../contracts";
import { category, makeFact, withFacts } from "../../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../../i18nKeys";
import { chooseFastestJourney, findLineById, formatServiceTime, getReadyFrequencyEntries, summarizeJourney } from "../../journeys";
import { clamp, normalizeScoreText, saturatingNeighborhoodBonus, weightedAverage } from "../../primitives";
import { coLocatedCurrentLines, formatTransportLineName, lineKey, listTransportAccessSignals, makeTransportAccessFact, NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS, transportLineReferencesMatch } from "../../transportAccess";
import { buildJourneyBenchmarkFacts } from "./benchmarks";
import { buildNoctilienFacts } from "./noctilien";
import { makeServiceQualityFact, summarizeNearbyServiceQuality } from "./serviceQuality";

export function buildTransportCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("transport");
  if (!input.stationsLoaded) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.transport",
      positiveFacts: [],
      negativeFacts: [],
    };
  }

  const accessSignals = listTransportAccessSignals(input);
  const linesByKey = new Map<string, GlobalMapLine>();
  for (const entry of input.stations) {
    if (!entry.insideRadius) continue;
    for (const line of entry.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      linesByKey.set(lineKey(line), line);
    }
  }
  for (const signal of accessSignals) {
    linesByKey.set(lineKey(signal.line), signal.line);
  }

  const accessibleSignals = accessSignals.filter((signal) => signal.travelSeconds <= NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS);
  const accessibleCurrentSignals = accessibleSignals.filter((signal) => !signal.futureProject);
  const accessibleLineKeys = new Set(accessibleCurrentSignals.map((signal) => lineKey(signal.line)));
  const accessibleModes = new Set(accessibleCurrentSignals.map((signal) => signal.line.mode));
  const futureProjects = input.backendVerdict?.futureProjects ?? [];
  // The verdict keeps nearby GPE stations with a real walking route even
  // when that walking leg exceeds 15 minutes. Such a station can still be a
  // valid future hub when it is co-located with an accessible current line.
  const routedFutureProjects = futureProjects.filter((project) =>
    Number.isFinite(project.walkingMinutes) && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) >= 0);
  const accessibleFutureProjects = futureProjects.filter((project) =>
    Number.isFinite(project.walkingMinutes) && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) <= 15);
  const resolverFutureProjects = accessibleSignals
    .filter((signal) => signal.source === "route" && signal.futureProject)
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
  const structuralLineCount = accessibleLineKeys.size + [...futureLineKeys].filter((key) =>
    ![...accessibleLineKeys].some((currentKey) => currentKey.endsWith(`:${key.slice("future:".length)}`))).length;
  const sharedHubEvidence = coLocatedFutureProjects.length > 0;
  const reliableConnectionEvidence = accessibleSignals.some((signal) => signal.source === "route" && Boolean(signal.via));

  const nearestAccess = accessSignals[0];
  const fastestJourney = chooseFastestJourney(input.chateletJourneys);
  const journeySummary = fastestJourney ? summarizeJourney(fastestJourney) : undefined;
  const readyFrequencies = getReadyFrequencyEntries(
    input.frequencyProfiles,
    input.stations,
    input.heavyCandidates,
    accessSignals,
  );
  const scoreParts: Array<{ value: number; weight: number }> = [];

  if (nearestAccess) {
    scoreParts.push({
      value: nearestAccess.source === "route"
        ? clamp(10 * (1 - nearestAccess.minutes / 30))
        : clamp(10 * (1 - nearestAccess.distanceMeters / 2_000)),
      weight: 0.4 * 0.85,
    });
  }
  if (linesByKey.size > 0) {
    scoreParts.push({ value: saturatingNeighborhoodBonus(structuralLineCount, 4, 10), weight: 0.25 * 0.85 });
  }
  if (accessibleModes.size > 0) {
    scoreParts.push({ value: saturatingNeighborhoodBonus(accessibleModes.size, 3, 10), weight: 0.15 * 0.85 });
  }
  if (journeySummary) {
    scoreParts.push({
      value: clamp(10 * (1 - Math.max(0, journeySummary.durationMinutes - 15) / 75)),
      weight: 0.15 * 0.85,
    });
  }
  if (readyFrequencies.length > 0) {
    const relevanceTotal = readyFrequencies.reduce((sum, entry) => sum + entry.relevanceWeight, 0);
    const frequencyScore = readyFrequencies.reduce(
      (sum, entry) => sum + clamp(10 * (1 - Math.max(0, entry.minutes - 2) / 13)) * entry.relevanceWeight,
      0,
    ) / relevanceTotal;
    scoreParts.push({
      value: frequencyScore,
      weight: 0.05 * 0.85 * Math.min(1, relevanceTotal),
    });
  }

  const serviceQuality = summarizeNearbyServiceQuality(input, [...linesByKey.values()]);
  if (serviceQuality) scoreParts.push({ value: serviceQuality.score / 10, weight: 0.15 });

  const positiveFacts: NeighborhoodFact[] = [];
  const negativeFacts: NeighborhoodFact[] = [];
  const neutralFacts: NeighborhoodFact[] = [];
  if (serviceQuality && input.serviceQuality) {
    const qualityFact = makeServiceQualityFact(serviceQuality, input.serviceQuality);
    if (qualityFact.polarity === "positive") positiveFacts.push(qualityFact);
    else if (qualityFact.polarity === "negative") negativeFacts.push(qualityFact);
    else neutralFacts.push(qualityFact);
  }
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
  for (const signal of accessSignals.filter((candidate) => !hubCoveredLineKeys.has(lineKey(candidate.line))).slice(0, 4)) {
    positiveFacts.push(makeTransportAccessFact(signal));
  }

  if (structuralLineCount >= 3) {
    positiveFacts.push(makeFact({
      id: "transport-offer",
      kind: "transportOffer",
      category: "transport",
      polarity: "positive",
      family: "transport-diversity",
      priority: 9,
      values: {
        lines: structuralLineCount,
        modes: [...new Set([
          ...accessibleModes,
          ...(effectiveFutureProjects.length > 0 ? ["GPE"] : []),
        ])].sort().join(", "),
      },
      sourceKey: SOURCE_KEYS.stations,
      proof: "direct",
      ruleKey: RULE_KEYS.transportDiversity,
      ruleValues: { threshold: 3 },
    }));
  } else if (linesByKey.size === 0 && !input.heavyCandidatesLoading) {
    negativeFacts.push(makeFact({
      id: "transport-limited",
      kind: "transportLimited",
      category: "transport",
      polarity: "negative",
      family: "transport-diversity",
      priority: 7,
      values: {},
      sourceKey: SOURCE_KEYS.stations,
      proof: "direct",
      ruleKey: RULE_KEYS.transportDiversity,
      ruleValues: { threshold: 1 },
    }));
  }

  for (const { project, currentLines } of coLocatedFutureProjects) {
    const currentLineNames = currentLines.map((line) => formatTransportLineName(line));
    if (currentLineNames.length === 0) continue;
    const matchingAccess = accessibleSignals.find((signal) =>
      currentLines.some((line) => lineKey(line) === lineKey(signal.line)));
    const futureAccess = accessibleSignals.find((signal) =>
      signal.futureProject?.id === project.id && signal.source === "route");
    const routeAccess = futureAccess ?? matchingAccess;
    const walkingMinutes = Number.isFinite(project.walkingMinutes)
      && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) <= 15
      ? project.walkingMinutes
      : undefined;
    // A project beyond the walking threshold must be backed by a real route
    // to the current line; a map-distance estimate is not enough to create a
    // future transport hub.
    const transitMinutes = routeAccess?.source === "route"
      ? routeAccess.minutes
      : undefined;
    const minutes = walkingMinutes ?? transitMinutes;
    if (!minutes) continue;
    const via = routeAccess?.source === "route" && routeAccess.via
      ? routeAccess.via
      : walkingMinutes !== undefined
        ? "à pied"
        : currentLineNames[0];
    positiveFacts.push(makeFact({
      id: `transport-hub-${normalizeScoreText(project.line).replace(/[^a-z0-9]+/gu, "-")}`,
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
      ruleValues: { threshold: 15 },
      emphasis: "exceptional",
      travel: routeAccess?.journey ? { journey: routeAccess.journey } : undefined,
    }));
  }

  const benchmarkFacts = buildJourneyBenchmarkFacts(input);
  positiveFacts.push(...benchmarkFacts.positiveFacts);
  negativeFacts.push(...benchmarkFacts.negativeFacts);
  positiveFacts.push(...buildNoctilienFacts(input.noctilienJourneys));

  if (journeySummary) {
    const values = {
      duration: journeySummary.durationMinutes,
      elapsed: journeySummary.elapsedMinutes,
      initialWait: journeySummary.initialWaitMinutes,
      walking: journeySummary.walkingMinutes,
      transfers: journeySummary.transfers,
      lines: journeySummary.lines,
    };
    if (journeySummary.durationMinutes <= 30) {
      positiveFacts.push(makeFact({
        id: "chatelet-under-30",
        kind: "chateletUnder30",
        category: "transport",
        polarity: "positive",
        family: "chatelet-access",
        priority: 10,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletUnder30,
        ruleValues: { threshold: 30 },
        emphasis: journeySummary.durationMinutes <= 20 && journeySummary.transfers === 0 ? "exceptional" : undefined,
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    } else if (journeySummary.durationMinutes <= 45) {
      positiveFacts.push(makeFact({
        id: "chatelet-under-45",
        kind: "chateletUnder45",
        category: "transport",
        polarity: "positive",
        family: "chatelet-access",
        priority: 9,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletUnder45,
        ruleValues: { threshold: 45 },
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    } else if (journeySummary.durationMinutes >= 60) {
      negativeFacts.push(makeFact({
        id: "chatelet-over-60",
        kind: "chateletOver60",
        category: "transport",
        polarity: "negative",
        family: "chatelet-access",
        priority: 8,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletOver60,
        ruleValues: { threshold: 60 },
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    } else {
      neutralFacts.push(makeFact({
        id: "chatelet-context",
        kind: "chateletContext",
        category: "transport",
        polarity: "neutral",
        family: "chatelet-access",
        priority: 6,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletContext,
        ruleValues: { minimum: 45, maximum: 60 },
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    }
    if (journeySummary.transitSectionCount <= 1 && journeySummary.transfers === 0) {
      positiveFacts.push(makeFact({
        id: "chatelet-direct",
        kind: "chateletDirect",
        category: "transport",
        polarity: "positive",
        family: "chatelet-direct",
        priority: 8,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletDirect,
        ruleValues: { threshold: 0 },
        emphasis: journeySummary.durationMinutes <= 20 ? "exceptional" : undefined,
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    }
  }

  for (const entry of readyFrequencies) {
    const peakMinutes = entry.minutes;
    const minutes = Math.round(peakMinutes * 10) / 10;
    const values = { minutes, transport: entry.label, lines: entry.label };
    if (entry.accessSeconds > NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS) {
      neutralFacts.push(makeFact({
        id: `frequency-context:${entry.lineId}`,
        kind: "frequencyRemote",
        category: "transport",
        polarity: "neutral",
        family: `frequency:${entry.lineId}`,
        priority: 4,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyContext,
        ruleValues: {
          threshold: NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS / 60,
          maximum: NEIGHBORHOOD_FREQUENCY_CONTEXT_MAX_SECONDS / 60,
        },
      }));
    } else if (peakMinutes <= 5) {
      positiveFacts.push(makeFact({
        id: `frequency-high:${entry.lineId}`,
        kind: "frequencyVeryGood",
        category: "transport",
        polarity: "positive",
        family: `frequency:${entry.lineId}`,
        priority: 7,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyHigh,
        ruleValues: { threshold: 5 },
      }));
    } else if (
      entry.mode === "TRANSILIEN"
        ? peakMinutes > getNeighborhoodFrequencyLowThreshold(entry.mode)
        : peakMinutes >= getNeighborhoodFrequencyLowThreshold(entry.mode)
    ) {
      const threshold = getNeighborhoodFrequencyLowThreshold(entry.mode);
      negativeFacts.push(makeFact({
        id: `frequency-low:${entry.lineId}`,
        kind: "frequencyLow",
        category: "transport",
        polarity: "negative",
        family: `frequency:${entry.lineId}`,
        priority: 6,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: entry.mode === "TRANSILIEN"
          ? RULE_KEYS.frequencyLowTransilien
          : RULE_KEYS.frequencyLow,
        ruleValues: { threshold },
      }));
    } else {
      neutralFacts.push(makeFact({
        id: `frequency-context:${entry.lineId}`,
        kind: "frequencyContext",
        category: "transport",
        polarity: "neutral",
        family: `frequency:${entry.lineId}`,
        priority: 5,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyReference,
        ruleValues: {},
      }));
    }
  }

  for (const [lineId, lastService] of input.lastServiceByLine ?? []) {
    if (!lastService || lastService.seconds >= EARLY_LAST_SERVICE_CUTOFF_SECONDS) continue;
    const line = findLineById(input, lineId);
    if (!line || !HEAVY_SCORE_MODES.has(line.mode)) continue;
    negativeFacts.push(makeFact({
      id: `last-service-early:${lineId}`,
      kind: "lastServiceEarly",
      category: "transport",
      polarity: "negative",
      family: `last-service:${lineId}`,
      priority: 8,
      values: { line: formatTransportLineName(line), time: formatServiceTime(lastService.seconds) },
      sourceKey: SOURCE_KEYS.frequency,
      proof: "direct",
      ruleKey: RULE_KEYS.lastService,
      ruleValues: { threshold: "21:00" },
    }));
  }

  const weightedScore = scoreParts.length > 0 ? weightedAverage(scoreParts) : 1.5;
  const exceptionalTransport = structuralLineCount >= 3
    && (sharedHubEvidence || reliableConnectionEvidence || effectiveFutureProjects.length > 0);
  return withFacts({
    ...base,
    available: true,
    score: exceptionalTransport ? Math.max(9, weightedScore) : weightedScore,
    positiveFacts,
    negativeFacts,
    neutralFacts,
  });
}
