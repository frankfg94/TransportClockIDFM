import type { TranslationKey } from "../../../i18n";

export interface NeighborhoodTransportLoadingInput {
  pendingTaskIds: readonly string[];
  stations: boolean;
  heavyAccess: boolean;
  futureProjects: boolean;
  serviceQuality: boolean;
}

/** Names follow the existing transport loaders, independently of score facts. */
export function neighborhoodTransportLoadingTasks(input: NeighborhoodTransportLoadingInput): { id: string; labelKey: TranslationKey }[] {
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
  ];
  return active.filter(([, loading]) => loading).map(([id]) => ({
    id, labelKey: `nearbyStations.neighborhoodScore.transportTasks.${id}` as TranslationKey,
  }));
}
