import { classifyParkWalking, PARK_WALKING_RULE } from "./neighborhood/criteria/greenSpaceFactRules";
import { locateAtGreenBoundary } from "../../../shared/greenSpaceBoundary";
import type { GreenBoundary, GreenPoint } from "../../../shared/natureInCity";
import { haversineMeters } from "./nearbyWalkingRoutes";

export interface ParkWalkingProfile {
  meters: number;
  loops: number;
  longestLoopMeters: number;
  featureKinds: number;
  featuresPerHectare: number;
  picnic: boolean;
  features: number;
}

export interface WalkNetwork {
  nodes: (GreenPoint & { id: number })[];
  paths: number[][];
  features: (GreenPoint & { kind: string })[];
}

export { classifyParkWalking, PARK_WALKING_RULE } from "./neighborhood/criteria/greenSpaceFactRules";

function indexParkNetwork(network: WalkNetwork, boundary: GreenBoundary) {
  const nodes = new Map(network.nodes.filter(node => locateAtGreenBoundary(node, boundary).inside).map(node => [node.id, node]));
  const graph = new Map<number, Map<number, number>>();
  const link = (a: number, b: number, meters: number) => {
    const links = graph.get(a) ?? new Map<number, number>();
    links.set(b, meters);
    graph.set(a, links);
  };
  for (const path of network.paths) for (let i = 1; i < path.length; i++) {
    const a = nodes.get(path[i - 1]!), b = nodes.get(path[i]!);
    if (!a || !b || a.id === b.id) continue;
    if (!locateAtGreenBoundary({ lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 }, boundary).inside) continue;
    const meters = haversineMeters(a, b);
    link(a.id, b.id, meters);
    link(b.id, a.id, meters);
  }
  return { graph, nodes, features: network.features.filter(feature => locateAtGreenBoundary(feature, boundary).inside) };
}

export function analyzeParkWalking(network: WalkNetwork, boundary: GreenBoundary, entry: GreenPoint, areaM2?: number): ParkWalkingProfile | undefined {
  return analyzeIndexedNetwork(indexParkNetwork(network, boundary), entry, areaM2);
}

function analyzeIndexedNetwork({ graph, nodes, features: nearbyFeatures }: ReturnType<typeof indexParkNetwork>,
  entry: GreenPoint, areaM2?: number): ParkWalkingProfile | undefined {
  let start: number | undefined;
  let closest: number = PARK_WALKING_RULE.accessSnapMeters;
  for (const id of graph.keys()) {
    const distance = haversineMeters(entry, nodes.get(id)!);
    if (distance <= closest) { start = id; closest = distance; }
  }
  if (start === undefined) return;
  const parents = new Map<number, number>();
  const distances = new Map([[start, 0]]);
  const queue = [start];
  let meters = 0, loops = 0, longestLoopMeters = 0;
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    for (const [b, length] of graph.get(a)!) {
      if (a < b) meters += length;
      if (!distances.has(b)) {
        parents.set(b, a);
        distances.set(b, distances.get(a)! + length);
        queue.push(b);
      } else if (a < b && parents.get(b) !== a && parents.get(a) !== b) {
        // Each non-tree edge closes one independent circuit. Subtract the
        // common approach to measure the circuit itself, not the walk to it.
        const ancestors = new Set<number>();
        for (let n: number | undefined = a; n !== undefined; n = parents.get(n)) ancestors.add(n);
        let common = b;
        while (!ancestors.has(common)) common = parents.get(common)!;
        const circuit = distances.get(a)! + distances.get(b)! - 2 * distances.get(common)! + length;
        longestLoopMeters = Math.max(longestLoopMeters, circuit);
        if (circuit >= PARK_WALKING_RULE.minLoopMeters) loops++;
      }
    }
  }
  const mappedFeatures = nearbyFeatures.filter(feature => queue.some(id => haversineMeters(feature, nodes.get(id)!) <= 75));
  const features = mappedFeatures.filter(feature => feature.kind !== "picnic");
  return { meters, loops, longestLoopMeters, features: features.length, featureKinds: new Set(features.map(feature => feature.kind)).size,
    featuresPerHectare: areaM2 && areaM2 > 0 ? features.length * 10_000 / areaM2 : 0,
    picnic: mappedFeatures.some(feature => feature.kind === "picnic") };
}

export type ParkWalkingApproach = { point: GreenPoint; minutes: number };
export function selectParkWalkingProfile(network: WalkNetwork, boundary: GreenBoundary,
  approaches: readonly ParkWalkingApproach[], areaM2?: number): { profile: ParkWalkingProfile; accessMinutes: number } | undefined {
  const indexed = indexParkNetwork(network, boundary);
  return approaches.flatMap(({ point, minutes }) => {
    const profile = analyzeIndexedNetwork(indexed, point, areaM2);
    return profile ? [{ profile, accessMinutes: minutes }] : [];
  }).sort((a, b) => classifyParkWalking(b.profile) - classifyParkWalking(a.profile) || a.accessMinutes - b.accessMinutes)[0];
}
