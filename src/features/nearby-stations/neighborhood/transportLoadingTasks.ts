import type { TranslationKey } from "../../../i18n";

export interface NeighborhoodTransportLoadingInput {
  pendingTaskIds: readonly string[];
  stations: boolean;
  heavyAccess: boolean;
  heavyAccessCounts?: { accesses: number; lines: number; targets?: { completed: number; total: number } };
  futureProjects: boolean;
  serviceQuality: boolean;
}

export interface NeighborhoodTransportLoadingTask {
  id: string;
  labelKey: TranslationKey;
  counts?: NeighborhoodTransportLoadingInput["heavyAccessCounts"];
}

/** Names follow the existing transport loaders, independently of score facts. */
export function neighborhoodTransportLoadingTasks(input: NeighborhoodTransportLoadingInput): NeighborhoodTransportLoadingTask[] {
  const has = (prefix: string) => input.pendingTaskIds.some(id => id.startsWith(prefix));
  const active: [string, boolean][] = [
    ["stations", input.stations],
    ["heavyAccess", input.heavyAccess],
    ["majorStations", input.pendingTaskIds.some(id => id.startsWith("journey:") && !id.startsWith("journey:employment-"))],
    ["employmentHubs", has("journey:employment-")],
    ["night", has("noctilien:")],
    ["frequencies", has("frequency:")],
    ["branches", has("branches:")],
    ["lastServices", has("last-service:")],
    ["futureProjects", input.futureProjects || has("backend-verdict") || has("backend-walking")],
    ["serviceQuality", input.serviceQuality],
    ["passengerSatisfaction", has("passenger-satisfaction")],
  ];
  return active.filter(([, loading]) => loading).map(([id]) => ({
    id, labelKey: `nearbyStations.neighborhoodScore.transportTasks.${id}` as TranslationKey,
    ...(id === "heavyAccess" && input.heavyAccessCounts ? { counts: input.heavyAccessCounts } : {}),
  }));
}
