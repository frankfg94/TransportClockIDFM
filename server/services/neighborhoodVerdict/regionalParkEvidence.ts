import { greenSpaceIdentity, legacyGreenSpaceId } from "../../../shared/greenSpaceIdentity";
import type { PublicGreenSpaceAccess } from "../../../src/features/nearby-stations/neighborhoodVerdictApi";
import { haversineMeters } from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import type { CompiledGreenSpace, NeighborhoodVerdictResponse, VerdictEvidence } from "./contracts";

export function mergeRegionalParkEvidence(verdict: NeighborhoodVerdictResponse, regional: PublicGreenSpaceAccess[],
  compiled: readonly CompiledGreenSpace[]): NeighborhoodVerdictResponse {
  const parks = regional.filter(space => space.parkMap || space.woodlandMap);
  if (!parks.length) return { ...verdict, nearbyGreenSpaces: [...(verdict.nearbyGreenSpaces ?? []), ...regional] };
  const byLegacyId = new Map<string, { park: PublicGreenSpaceAccess; name: string }>();
  const legacy = verdict.nearbyGreenSpaces ?? [];
  for (const space of compiled) {
    const key = greenSpaceIdentity(space.name);
    const [lon, lat] = space.centroid;
    const matches = parks.filter(park => key === greenSpaceIdentity(park.name)
      && haversineMeters(park, { lon, lat }) <= 1600);
    const park = matches.sort((a, b) => haversineMeters(a, { lon, lat }) - haversineMeters(b, { lon, lat }))[0];
    if (park) byLegacyId.set(space.id, { park, name: space.name });
  }
  const categories = verdict.categories.map(category => {
    if (category.id !== "nature-leisure") return category;
    const chosen = new Map<string, VerdictEvidence>();
    for (const fact of category.positiveFacts) {
      const match = byLegacyId.get(legacyGreenSpaceId(fact) ?? "");
      if (!match || !match.park.parkMap || match.park.mainSurfaceM2 !== undefined) continue;
      const previous = chosen.get(match.park.id);
      const access = fact.greenSpaceAccess;
      const candidatePriority = (item: VerdictEvidence) => item.priority + (item.greenSpaceAccess?.estimated === false ? 100 : 0);
      if (previous && candidatePriority(previous) >= candidatePriority(fact)) continue;
      chosen.set(match.park.id, { ...fact, family: `managed-green-space:${match.park.id}`,
        greenMap: match.park.parkMap, label: fact.label.replace(match.name, match.park.name),
        ...(access ? { greenSpaceAccess: { ...access, name: match.park.name } } : {}) });
    }
    const isGrouped = (fact: VerdictEvidence) => byLegacyId.has(legacyGreenSpaceId(fact) ?? "");
    return { ...category, positiveFacts: [...category.positiveFacts.filter(fact => !isGrouped(fact)), ...chosen.values()],
      neutralFacts: category.neutralFacts.filter(fact => !isGrouped(fact)) };
  });
  const aliases = new Map<string, string[]>();
  for (const [id, { park }] of byLegacyId) {
    if (park.parkMap) aliases.set(park.id, [...(aliases.get(park.id) ?? []), id]);
  }
  return { ...verdict, categories,
    nearbyGreenSpaces: [...legacy.filter(space => !byLegacyId.has(space.id)), ...regional.map(space => {
      const extra = aliases.get(space.id);
      return extra ? { ...space, parkAliases: [...(space.parkAliases ?? []), ...extra] } : space;
    })] };
}
