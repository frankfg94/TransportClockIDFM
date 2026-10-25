import type { GlobalMapLine } from "../../../transport-map/contracts/manifest";
import type { NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { HEAVY_SCORE_MODES } from "../contracts";
import { getReadyFrequencyEntries } from "../journeys";
import { lineKey, listTransportAccessSignals, selectBestTransportAccessSignals, transportAccessGroupKey, NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS } from "./heavyTransports";
import { buildGpeExpressContext } from "./gpeExpress";
import { buildChateletContext } from "./chatelet";
import { summarizeNearbyServiceQuality } from "./lineRegularity";
import { normalizeScoreText } from "../primitives";

export function buildTransportFactsContext(input: NeighborhoodScoreInput) {
  const accessSignals = listTransportAccessSignals(input);
  const eligibleSignals = selectBestTransportAccessSignals(accessSignals)
    .filter(signal => signal.travelSeconds <= NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS && (signal.contributionWeight ?? 1) > 0);
  const classifiedLines = new Set(eligibleSignals.filter(signal => signal.section && signal.section.kind !== "unclassified")
    .map(signal => lineKey(signal.line)));
  // An unidentified station may retain the historical line bonus, but cannot
  // invent an additional branch alongside a classified access to that line.
  const scoredAccessSignals = eligibleSignals.filter(signal => signal.section?.kind !== "unclassified" || !classifiedLines.has(lineKey(signal.line)));
  const linesByKey = new Map<string, GlobalMapLine>();
  for (const entry of input.stations) {
    if (!entry.insideRadius) continue;
    for (const line of entry.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      linesByKey.set(lineKey(line), line);
    }
  }
  for (const signal of scoredAccessSignals) {
    linesByKey.set(lineKey(signal.line), signal.line);
  }

  const accessibleSignals = scoredAccessSignals;
  const accessibleCurrentSignals = accessibleSignals.filter((signal) => !signal.futureProject);
  const accessibleLineKeys = new Set(accessibleCurrentSignals.map((signal) => lineKey(signal.line)));
  const accessibleModes = new Set(accessibleCurrentSignals.map((signal) => signal.line.mode));
  const branchWeights = new Map<string, number>();
  const lineWeights = new Map<string, number>();
  const modeWeights = new Map<string, number>();
  for (const signal of accessibleCurrentSignals) {
    const weight = signal.contributionWeight ?? 1;
    branchWeights.set(transportAccessGroupKey(signal), weight);
    lineWeights.set(lineKey(signal.line), Math.max(lineWeights.get(lineKey(signal.line)) ?? 0, weight));
    modeWeights.set(signal.line.mode, Math.max(modeWeights.get(signal.line.mode) ?? 0, weight));
  }
  const gpe = buildGpeExpressContext(input, accessSignals, accessibleLineKeys);
  const { futureLineKeys, effectiveFutureProjects, coLocatedFutureProjects } = gpe;
  const structuralLines: NonNullable<NeighborhoodFact["transportLines"]>[number][] = [
    ...new Map(accessibleCurrentSignals.map(signal => [lineKey(signal.line), signal.line])).values(),
  ];
  for (const key of futureLineKeys) {
    const code = key.slice("future:".length);
    if ([...accessibleLineKeys].some(currentKey => currentKey.endsWith(`:${code}`))) continue;
    const project = effectiveFutureProjects.find(candidate => normalizeScoreText(candidate.line) === code);
    if (!project) continue;
    const knownLine = accessSignals.find(signal => signal.futureProject?.id === project.id)?.line;
    structuralLines.push({ id: key, code: project.line, label: project.line, aliases: knownLine?.aliases ?? [], mode: knownLine?.mode ?? "METRO",
      color: knownLine?.color ?? "", textColor: knownLine?.textColor ?? "", future: true });
  }
  const structuralLineCount = structuralLines.length;
  const structuralLineWeight = [...branchWeights.values()].reduce((sum, weight) => sum + weight, 0)
    + structuralLineCount - accessibleLineKeys.size;
  const accessibleModeWeight = [...modeWeights.values()].reduce((sum, weight) => sum + weight, 0);
  const sharedHubEvidence = coLocatedFutureProjects.some(({ project }) => effectiveFutureProjects.some(effective => effective.id === project.id));
  const reliableConnectionEvidence = accessibleSignals.some((signal) => signal.source === "route" && Boolean(signal.via));

  const chatelet = buildChateletContext(input);
  const readyFrequencies = getReadyFrequencyEntries(
    input.frequencyProfiles,
    input.stations,
    input.heavyCandidates,
    scoredAccessSignals,
  );
  const serviceQuality = summarizeNearbyServiceQuality(input, [...linesByKey.values()]);
  return { input, accessSignals, scoredAccessSignals, linesByKey, accessibleSignals, accessibleLineKeys, accessibleModes, lineWeights, modeWeights,
    structuralLines, structuralLineCount, structuralLineWeight, accessibleModeWeight, sharedHubEvidence, reliableConnectionEvidence, readyFrequencies, serviceQuality, ...gpe, ...chatelet };
}

export type TransportFactsContext = ReturnType<typeof buildTransportFactsContext>;
