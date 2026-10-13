import type { GlobalMapLine } from "../../../transport-map/contracts/manifest";
import type { NeighborhoodScoreInput } from "../contracts";
import { HEAVY_SCORE_MODES } from "../contracts";
import { getReadyFrequencyEntries } from "../journeys";
import { lineKey, listTransportAccessSignals, NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS } from "./heavyTransports";
import { buildGpeExpressContext } from "./gpeExpress";
import { buildChateletContext } from "./chatelet";
import { summarizeNearbyServiceQuality } from "./lineRegularity";

export function buildTransportFactsContext(input: NeighborhoodScoreInput) {
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
  const reducedCurrentSignals = accessSignals.filter(signal => !signal.futureProject && (signal.contributionWeight ?? 1) < 1);
  const lineWeights = new Map(accessibleCurrentSignals.map(signal => [lineKey(signal.line), 1]));
  const modeWeights = new Map<string, number>([...accessibleModes].map(mode => [mode, 1]));
  for (const signal of reducedCurrentSignals) {
    const weight = signal.contributionWeight ?? 1;
    lineWeights.set(lineKey(signal.line), Math.max(lineWeights.get(lineKey(signal.line)) ?? 0, weight));
    modeWeights.set(signal.line.mode, Math.max(modeWeights.get(signal.line.mode) ?? 0, weight));
  }
  const gpe = buildGpeExpressContext(input, accessSignals, accessibleLineKeys);
  const { futureLineKeys, effectiveFutureProjects, coLocatedFutureProjects } = gpe;
  const structuralLineCount = accessibleLineKeys.size + [...futureLineKeys].filter((key) =>
    ![...accessibleLineKeys].some((currentKey) => currentKey.endsWith(`:${key.slice("future:".length)}`))).length;
  const structuralLineWeight = [...lineWeights.values()].reduce((sum, weight) => sum + weight, 0)
    + structuralLineCount - accessibleLineKeys.size;
  const accessibleModeWeight = [...modeWeights.values()].reduce((sum, weight) => sum + weight, 0);
  const sharedHubEvidence = coLocatedFutureProjects.length > 0;
  const reliableConnectionEvidence = accessibleSignals.some((signal) => signal.source === "route" && Boolean(signal.via));

  const chatelet = buildChateletContext(input);
  const readyFrequencies = getReadyFrequencyEntries(
    input.frequencyProfiles,
    input.stations,
    input.heavyCandidates,
    accessSignals,
  );
  const serviceQuality = summarizeNearbyServiceQuality(input, [...linesByKey.values()]);
  return { input, accessSignals, linesByKey, accessibleSignals, accessibleLineKeys, accessibleModes, lineWeights, modeWeights,
    structuralLineCount, structuralLineWeight, accessibleModeWeight, sharedHubEvidence, reliableConnectionEvidence, readyFrequencies, serviceQuality, ...gpe, ...chatelet };
}

export type TransportFactsContext = ReturnType<typeof buildTransportFactsContext>;
