import {
  AIR_NOISE_GRID_SOURCE_ID,
  AIR_NOISE_STATISTICS_SOURCE_ID,
  VERDICT_SCHEMA_VERSION,
  type CompiledAirNoiseCommune,
  type CompiledAirNoiseGrid,
  type CompiledGreenSpace,
  type CompiledNeighborhoodVerdictData,
  type NeighborhoodVerdictResponse,
  type PublicGreenSpaceAccess,
  type PublicFutureGpeStation,
  type SecurityTrendResult,
  type VerdictCategoryId,
  type VerdictCategorySignal,
  type VerdictEvidence,
  type VerdictPolarity,
} from "./contracts";
import type { AdministrativeLocation } from "./geoApi";

const WEIGHTS: Record<VerdictCategoryId, number> = {
  transport: 0.27,
  "daily-life": 0.225,
  "nature-leisure": 0.135,
  health: 0.135,
  education: 0.09,
  "living-environment": 0.045,
  security: 0.1,
};

export interface WalkingRoute {
  durationSeconds: number;
  distanceMeters: number;
}

export type WalkingRouter = (
  from: [number, number],
  to: [number, number],
) => Promise<WalkingRoute | undefined>;

export async function buildNeighborhoodVerdict(
  data: CompiledNeighborhoodVerdictData,
  point: { lat: number; lon: number },
  admin: AdministrativeLocation,
  routeWalking?: WalkingRouter,
): Promise<NeighborhoodVerdictResponse> {
  const stale = new Set(
    data.sources
      .filter((source) => source.freshness.status === "stale")
      .map((source) => source.id),
  );
  const transport = await transportSignal(data, point, routeWalking, stale);
  const nature = await natureSignal(data, point, admin, stale, routeWalking);
  const categories: VerdictCategorySignal[] = [
    transport.signal,
    unavailable("daily-life"),
    nature.signal,
    unavailable("health"),
    unavailable("education"),
    livingSignal(data, point, admin, stale),
    securitySignal(data, admin, stale),
  ];
  const available = categories.filter(
    (category) => category.status === "available" && category.score !== undefined,
  );
  const availableWeight = available.reduce(
    (sum, category) => sum + WEIGHTS[category.id],
    0,
  );
  const score = availableWeight
    ? available.reduce(
        (sum, category) => sum + (category.score as number) * WEIGHTS[category.id],
        0,
      ) / availableWeight
    : undefined;
  const commune = data.security.communes[admin.commune.code];
  const trend = data.security.trends[admin.departmentCode];
  return {
    schemaVersion: VERDICT_SCHEMA_VERSION,
    generatedAt: data.generatedAt,
    location: { ...point, commune: admin.commune, departmentCode: admin.departmentCode },
    overall: {
      score: rounded(score),
      displayScore: score === undefined ? undefined : Math.round(score),
      coverageRatio: roundNumber(availableWeight),
      availableCategoryCount: available.length,
      totalCategoryCount: categories.length,
    },
    categories,
    futureProjects: transport.futureProjects,
    nearbyGreenSpaces: nature.nearbyGreenSpaces,
    security: commune
      ? { commune, trend: trend ? contextualTrend(trend, commune.localScore) : undefined }
      : undefined,
    sources: data.sources,
    warnings: data.warnings,
  };
}

async function transportSignal(
  data: CompiledNeighborhoodVerdictData,
  point: { lat: number; lon: number },
  routeWalking: WalkingRouter | undefined,
  stale: Set<string>,
): Promise<{ signal: VerdictCategorySignal; futureProjects: PublicFutureGpeStation[] }> {
  if (stale.has("gpe-stations-2016") || !routeWalking) {
    return {
      signal: unavailable("transport", [
        "Bonus GPE non calculé : itinéraire piéton indisponible.",
      ]),
      futureProjects: [],
    };
  }
  const candidates = data.gpeStations
    .map((station) => ({
      station,
      distance: haversine(point.lat, point.lon, station.lat, station.lon),
    }))
    .filter((item) => item.distance <= 4_000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
  // Keep every nearby GPE station for which we obtained a real pedestrian
  // route. A station can be more than 15 minutes away on foot and still be
  // reachable through a current line at the same physical hub (Châtillon-
  // Montrouge is the concrete case). The 15-minute rule below remains the
  // limit for the standalone walking bonus; the frontend decides whether a
  // co-located current line provides the valid transit access.
  const futureProjects: PublicFutureGpeStation[] = [];
  const walkAccessibleFutureProjects: PublicFutureGpeStation[] = [];
  const facts: VerdictEvidence[] = [];
  for (const { station } of candidates) {
    const route = await routeWalking(
      [point.lon, point.lat],
      [station.lon, station.lat],
    );
    if (!route) continue;
    const minutes = route.durationSeconds / 60;
    const project: PublicFutureGpeStation = {
      ...station,
      walkingMinutes: Math.ceil(minutes),
      hubId: `${station.lon.toFixed(4)}:${station.lat.toFixed(4)}`,
    };
    futureProjects.push(project);
    if (minutes <= 15) {
      walkAccessibleFutureProjects.push(project);
      facts.push(
        evidence({
          id: `gpe-${station.id}`,
          category: "transport",
          polarity: "positive",
          family: "future-gpe",
          priority: 9,
          scoreImpact: 1,
          label: `Future gare ${station.name} (ligne ${station.line}) à ${Math.ceil(minutes)} min à pied`,
          explanation: `Le projet a été revérifié le ${station.verifiedAt}. L’ouverture annoncée reste prévisionnelle (${station.openingWindow ?? "calendrier à confirmer"}).`,
          rule: "Une gare GPE officielle confirmée à 15 minutes à pied ou moins ajoute au maximum 1 point à la catégorie transports.",
          value: Math.ceil(minutes),
          unit: "min à pied",
          referencePeriod: station.openingWindow,
          sourceIds: [
            "gpe-stations-2016",
            "gpe-current-status",
            "openstreetmap-routing",
          ],
        }),
      );
    }
  }
  return walkAccessibleFutureProjects.length
    ? { signal: available("transport", undefined, facts, [], 1), futureProjects }
    : {
        signal: unavailable("transport", [
          "Aucun bonus GPE documenté ; cela ne constitue pas un point faible.",
        ]),
        futureProjects,
      };
}

interface GreenSpaceSite {
  space: CompiledGreenSpace;
  distanceMeters: number;
  accessPoint: [number, number];
  surfaceM2: number;
}

interface GreenSpaceAccess extends GreenSpaceSite {
  walkingMinutes?: number;
  estimatedMinutes: number;
  routed: boolean;
}

interface NatureSignalResult {
  signal: VerdictCategorySignal;
  nearbyGreenSpaces: PublicGreenSpaceAccess[];
}

const GREEN_SPACE_ROUTE_CANDIDATE_LIMIT = 12;
const GREEN_SPACE_DISPLAY_LIMIT_MINUTES = 30;
const GREEN_SPACE_POSITIVE_LIMIT_MINUTES = 15;
const GREEN_SPACE_TRANSIT_MIN_SURFACE_M2 = 100_000;
const GREEN_SPACE_TRANSIT_DISPLAY_LIMIT_MINUTES = 45;
const GREEN_SPACE_TRANSIT_TARGET_LIMIT = 4;
const DEFAULT_GREEN_SPACE_SOURCE_ID = "hds-green-spaces";

async function natureSignal(
  data: CompiledNeighborhoodVerdictData,
  point: { lat: number; lon: number },
  admin: AdministrativeLocation,
  stale: Set<string>,
  routeWalking?: WalkingRouter,
): Promise<NatureSignalResult> {
  const sites = groupGreenSpaceSites(
    data.greenSpaces.filter((space) => !stale.has(greenSpaceSourceId(space))),
    point,
  );
  const nearest = [...sites].sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
  if (!nearest) return { signal: unavailable("nature-leisure"), nearbyGreenSpaces: [] };
  const distance = Math.round(nearest.distanceMeters);
  const nearestSourceId = greenSpaceSourceId(nearest.space);
  const score =
    distance <= 300
      ? 10
      : distance <= 600
        ? 8
        : distance <= 1_200
          ? 6
          : distance <= 2_000
            ? 4
            : 2;
  const facts: VerdictEvidence[] = [];
  const neutral: VerdictEvidence[] = [
    evidence({
      id: `green-reference-${nearest.space.id}`,
      category: "nature-leisure",
      polarity: "neutral",
      family: "managed-green-space-reference",
      priority: 5,
      scoreImpact: 0,
      label: `${nearest.space.name} : emprise verte gérée à ${distance} m`,
      explanation:
        "La distance est mesurée depuis la géométrie compilée ; cette donnée ne garantit ni l’ouverture au public ni la qualité des aménagements.",
      rule: "Repère descriptif conservé même lorsqu’il ne crée pas de point fort ou de point faible.",
      value: distance,
      unit: "m",
      geography: { level: "point" },
      referencePeriod: greenSpaceReferencePeriod(data, nearest.space),
      sourceIds: [nearestSourceId],
    }),
  ];
  if (distance <= 600) {
    facts.push(
      evidence({
        id: `green-${nearest.space.id}`,
        category: "nature-leisure",
        polarity: "positive",
        family: "managed-green-space",
        priority: 8,
        scoreImpact: 1,
        label: `${nearest.space.name}, espace vert géré à ${distance} m`,
        explanation:
          "La source géographique recense une emprise d’espace vert gérée ou assimilée ; elle ne garantit pas que le site soit ouvert au public.",
        rule: "Point fort si une emprise d’espace vert gérée ou assimilée est située à 600 m ou moins.",
        value: distance,
        unit: "m",
        geography: { level: "point" },
        referencePeriod: greenSpaceReferencePeriod(data, nearest.space),
        sourceIds: [nearestSourceId],
      }),
    );
  }

  const routeCandidates = [...sites]
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .filter((site, index) => index < 8 || (isNamedPark(site.space) && site.distanceMeters <= 3_000))
    .slice(0, GREEN_SPACE_ROUTE_CANDIDATE_LIMIT);
  const accessed = await Promise.all(routeCandidates.map(async (site): Promise<GreenSpaceAccess> => {
    const route = routeWalking && site.distanceMeters > 0
      ? await routeWalking([point.lon, point.lat], site.accessPoint)
      : undefined;
    const walkingMinutes = route && Number.isFinite(route.durationSeconds) && route.durationSeconds >= 0
      ? Math.max(0, Math.ceil(route.durationSeconds / 60))
      : undefined;
    return {
      ...site,
      walkingMinutes,
      estimatedMinutes: Math.max(1, Math.ceil(site.distanceMeters / 80)),
      routed: walkingMinutes !== undefined,
    };
  }));

  // Prefer the largest named parks, but keep the 15-minute rule explicit:
  // reachable parks are strengths; a larger park just beyond that threshold
  // remains a neutral nearby landmark instead of being sold as a strength.
  const namedParks = accessed
    .filter((candidate) => isNamedPark(candidate.space))
    .filter((candidate) => displayedGreenSpaceMinutes(candidate) <= GREEN_SPACE_DISPLAY_LIMIT_MINUTES)
    .sort((left, right) => (right.surfaceM2 - left.surfaceM2)
      || (displayedGreenSpaceMinutes(left) - displayedGreenSpaceMinutes(right))
      || left.space.name.localeCompare(right.space.name, "fr-FR"))
    .slice(0, 2);
  for (const candidate of namedParks) {
    const minutes = displayedGreenSpaceMinutes(candidate);
    const positive = minutes <= GREEN_SPACE_POSITIVE_LIMIT_MINUTES;
    const area = formatGreenSpaceArea(candidate.surfaceM2);
    const sourceId = greenSpaceSourceId(candidate.space);
    const timeLabel = candidate.routed ? `${minutes} min à pied` : `environ ${minutes} min à pied`;
    const sourceDistance = Math.round(candidate.distanceMeters);
    const areaLabel = area ? ` · ${area}` : "";
    (positive ? facts : neutral).push(
      evidence({
        id: `green-site-${candidate.space.id}`,
        category: "nature-leisure",
        polarity: positive ? "positive" : "neutral",
        family: `managed-green-space:${candidate.space.id}`,
        priority: positive ? 12 : 9,
        scoreImpact: positive ? 1 : 0,
        label: `${candidate.space.name} à ${timeLabel}${areaLabel}`,
        explanation: candidate.routed
          ? `Un itinéraire piéton réel vers le point d’accès géométrique le plus proche donne ${minutes} min ; l’emprise issue de la source représente ${area || "une surface non renseignée"}. La source ne garantit ni l’ouverture au public ni la qualité des aménagements.`
          : `${sourceDistance} m séparent l’adresse de l’emprise compilée ; ${timeLabel} est une estimation faute d’itinéraire piéton disponible. La source ne garantit ni l’ouverture au public ni la qualité des aménagements.`,
        rule: positive
          ? "Point fort si un parc nommé est accessible en 15 minutes à pied ou moins."
          : "Repère neutre pour un parc nommé situé à moins de 30 minutes à pied estimées.",
        value: candidate.surfaceM2 > 0 ? candidate.surfaceM2 : sourceDistance,
        unit: candidate.surfaceM2 > 0 ? "m²" : "m",
        geography: { level: "point" },
        referencePeriod: greenSpaceReferencePeriod(data, candidate.space),
        sourceIds: [sourceId, ...(candidate.routed ? ["openstreetmap-routing"] : [])],
      }),
    );
  }
  if (distance > 1_500) {
    facts.push(
      evidence({
        id: `green-far-${admin.commune.code}`,
        category: "nature-leisure",
        polarity: "negative",
        family: "managed-green-space",
        priority: 7,
        scoreImpact: -1,
        label: `Espace vert géré le plus proche à ${distance} m`,
        explanation:
          "Ce signal porte sur l’emprise verte compilée la plus proche ; il ne prétend pas recenser tous les espaces verts du quartier.",
        rule: "Point faible documenté lorsque l’emprise gérée la plus proche est à plus de 1 500 m.",
        value: distance,
        unit: "m",
        geography: { level: "commune", code: admin.commune.code, name: admin.commune.name },
        referencePeriod: greenSpaceReferencePeriod(data, nearest.space),
        sourceIds: [nearestSourceId],
      }),
    );
  }
  const nearbyGreenSpaces = accessed
    .filter((candidate) => isNamedPark(candidate.space))
    .filter((candidate) => candidate.surfaceM2 >= GREEN_SPACE_TRANSIT_MIN_SURFACE_M2)
    .filter((candidate) => displayedGreenSpaceMinutes(candidate) <= GREEN_SPACE_TRANSIT_DISPLAY_LIMIT_MINUTES)
    .sort((left, right) => (right.surfaceM2 - left.surfaceM2)
      || (displayedGreenSpaceMinutes(left) - displayedGreenSpaceMinutes(right))
      || left.space.name.localeCompare(right.space.name, "fr-FR"))
    .slice(0, GREEN_SPACE_TRANSIT_TARGET_LIMIT)
    .map((candidate): PublicGreenSpaceAccess => ({
      id: candidate.space.id,
      name: candidate.space.name,
      ...(candidate.space.category ? { category: candidate.space.category } : {}),
      ...(candidate.surfaceM2 > 0 ? { surfaceM2: candidate.surfaceM2 } : {}),
      // Use the same real boundary access point for the transit probe. The
      // point is projected on a polygon segment, not rounded to a distant
      // vertex, which keeps the T10 access to Domaine de Sceaux realistic.
      lon: candidate.accessPoint[0],
      lat: candidate.accessPoint[1],
      distanceMeters: Math.round(candidate.distanceMeters),
      ...(candidate.walkingMinutes !== undefined ? { walkingMinutes: candidate.walkingMinutes } : {}),
      estimatedWalkingMinutes: candidate.estimatedMinutes,
      transitPoints: listGreenSpaceTransitPoints(candidate.space, candidate.accessPoint),
    }));
  return {
    signal: available(
      "nature-leisure",
      score,
      facts.filter((fact) => fact.polarity === "positive"),
      facts.filter((fact) => fact.polarity === "negative"),
      undefined,
      [],
      neutral,
    ),
    nearbyGreenSpaces,
  };
}

function groupGreenSpaceSites(
  spaces: readonly CompiledGreenSpace[],
  point: { lat: number; lon: number },
): GreenSpaceSite[] {
  const sites = new Map<string, GreenSpaceSite>();
  for (const space of spaces) {
    const distanceMeters = distanceToGreenSpace(point, space);
    const accessPoint = nearestGreenSpacePoint(point, space);
    const key = space.id || space.name;
    const current = sites.get(key);
    if (!current) {
      sites.set(key, {
        space,
        distanceMeters,
        accessPoint,
        surfaceM2: space.surfaceM2 ?? 0,
      });
      continue;
    }
    current.surfaceM2 += space.surfaceM2 ?? 0;
    if (distanceMeters < current.distanceMeters) {
      current.space = { ...current.space, ...space, surfaceM2: current.surfaceM2 || undefined };
      current.distanceMeters = distanceMeters;
      current.accessPoint = accessPoint;
    }
  }
  return [...sites.values()];
}

function displayedGreenSpaceMinutes(candidate: GreenSpaceAccess): number {
  return candidate.walkingMinutes ?? candidate.estimatedMinutes;
}

function greenSpaceSourceId(space: CompiledGreenSpace): string {
  return space.sourceId ?? DEFAULT_GREEN_SPACE_SOURCE_ID;
}

function greenSpaceReferencePeriod(
  data: CompiledNeighborhoodVerdictData,
  space: CompiledGreenSpace,
): string | undefined {
  return space.referencePeriod
    ?? data.sources.find((source) => source.id === greenSpaceSourceId(space))?.referencePeriod;
}

function isNamedPark(space: CompiledGreenSpace): boolean {
  const name = normalizeGreenSpaceText(space.name);
  const category = normalizeGreenSpaceText(space.category ?? "");
  return category === "parc"
    || /\b(?:parc|domaine|vallee|foret|bois)\b/iu.test(`${name} ${category}`);
}

function formatGreenSpaceArea(surfaceM2: number): string | undefined {
  if (!(surfaceM2 > 0)) return undefined;
  if (surfaceM2 >= 10_000) return `${Math.round(surfaceM2 / 10_000)} ha`;
  return `${Math.round(surfaceM2)} m²`;
}

function normalizeGreenSpaceText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR");
}

function nearestGreenSpacePoint(
  point: { lat: number; lon: number },
  space: CompiledGreenSpace,
): [number, number] {
  if (distanceToGreenSpace(point, space) === 0) return [point.lon, point.lat];
  let nearest: [number, number] = space.centroid;
  let distance = haversine(point.lat, point.lon, nearest[1], nearest[0]);
  const rings = space.geometry.type === "Polygon"
    ? space.geometry.coordinates
    : space.geometry.coordinates.flat();
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      const candidate = nearestPointOnSegment(point, ring[index - 1]!, ring[index]!);
      const candidateDistance = haversine(point.lat, point.lon, candidate[1], candidate[0]);
      if (candidateDistance < distance) {
        nearest = candidate;
        distance = candidateDistance;
      }
    }
  }
  return nearest;
}

function nearestPointOnSegment(
  point: { lat: number; lon: number },
  left: number[],
  right: number[],
): [number, number] {
  const scale = Math.cos((point.lat * Math.PI) / 180);
  const px = point.lon * scale;
  const py = point.lat;
  const ax = left[0]! * scale;
  const ay = left[1]!;
  const bx = right[0]! * scale;
  const by = right[1]!;
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const ratio = length
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
    : 0;
  return [
    left[0]! + (right[0]! - left[0]!) * ratio,
    left[1]! + (right[1]! - left[1]!) * ratio,
  ];
}

function listGreenSpaceTransitPoints(
  space: CompiledGreenSpace,
  accessPoint: [number, number],
): Array<{ lon: number; lat: number }> {
  const rings = space.geometry.type === "Polygon"
    ? space.geometry.coordinates
    : space.geometry.coordinates.flat();
  const coordinates = rings.flatMap((ring) => ring)
    .filter((coordinate): coordinate is number[] => coordinate.length >= 2);
  const extrema: Array<number[] | undefined> = [
    coordinates.reduce((best, coordinate) => !best || coordinate[0]! < best[0]! ? coordinate : best, undefined as number[] | undefined),
    coordinates.reduce((best, coordinate) => !best || coordinate[0]! > best[0]! ? coordinate : best, undefined as number[] | undefined),
    coordinates.reduce((best, coordinate) => !best || coordinate[1]! < best[1]! ? coordinate : best, undefined as number[] | undefined),
    coordinates.reduce((best, coordinate) => !best || coordinate[1]! > best[1]! ? coordinate : best, undefined as number[] | undefined),
  ];
  const points: Array<{ lon: number; lat: number }> = [];
  const add = (coordinate: number[] | [number, number] | undefined): void => {
    if (!coordinate || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return;
    const point = { lon: coordinate[0]!, lat: coordinate[1]! };
    if (points.some((candidate) => haversine(candidate.lat, candidate.lon, point.lat, point.lon) < 80)) return;
    points.push(point);
  };
  add(accessPoint);
  add(space.centroid);
  for (const coordinate of extrema) add(coordinate);
  return points;
}

const AIR_NOISE_NEIGHBOR_RADIUS_CELLS = 2;

function livingSignal(
  data: CompiledNeighborhoodVerdictData,
  point: { lat: number; lon: number },
  admin: AdministrativeLocation,
  stale: Set<string>,
): VerdictCategorySignal {
  const statisticsSource = data.sources.find((source) => source.id === AIR_NOISE_STATISTICS_SOURCE_ID);
  const gridSource = data.sources.find((source) => source.id === AIR_NOISE_GRID_SOURCE_ID);
  const gridNeighborhood = !stale.has(AIR_NOISE_GRID_SOURCE_ID) && gridSource?.scorable
    ? lookupAirNoiseGridNeighborhood(data.airNoiseGrid, point.lon, point.lat, AIR_NOISE_NEIGHBOR_RADIUS_CELLS)
    : undefined;
  const gridClass = gridNeighborhood?.pointClass;
  const commune = lookupAirNoiseCommune(data.airNoiseCommunes, admin);
  const useGrid = Boolean(gridClass);
  if (!useGrid && (stale.has(AIR_NOISE_STATISTICS_SOURCE_ID) || !statisticsSource?.scorable || !commune)) {
    return unavailable("living-environment", ["Donnée air-bruit indisponible pour cette commune ou cette maille SIG."]);
  }

  const positive: VerdictEvidence[] = [];
  const negative: VerdictEvidence[] = [];
  const neutral: VerdictEvidence[] = [];
  const sourceId = useGrid ? AIR_NOISE_GRID_SOURCE_ID : AIR_NOISE_STATISTICS_SOURCE_ID;
  const geographyLevel = useGrid ? "point" : "commune";
  const airScore = useGrid ? componentAirNoiseScore(gridClass!, 1) : commune!.airScore;
  const noiseScore = useGrid ? componentAirNoiseScore(gridClass!, 0) : commune!.noiseScore;
  const pushComponent = (kind: "air" | "noise", score: number, label: string): void => {
    const polarity = airNoisePolarity(score);
    const level = describeAirNoiseLevel(kind, score);
    const fact = airNoiseFact(
      data,
      kind,
      polarity,
      score,
      admin,
      `${label} : ${level.label} (${rounded(score)}/10)`,
      sourceId,
      geographyLevel,
    );
    if (polarity === "positive") positive.push(fact);
    else if (polarity === "negative") negative.push(fact);
    else neutral.push(fact);
  };
  pushComponent(
    "air",
    airScore,
    useGrid ? "Qualité de l’air au point" : "Qualité de l’air communale",
  );
  pushComponent(
    "noise",
    noiseScore,
    useGrid ? "Environnement sonore au point" : "Environnement sonore communal",
  );

  if (useGrid && gridNeighborhood && gridNeighborhood.classes.length > 1) {
    const noiseScores = gridNeighborhood.classes.map((className) => componentAirNoiseScore(className, 0));
    const minimum = Math.min(...noiseScores);
    const maximum = Math.max(...noiseScores);
    if (minimum !== maximum) neutral.push(airNoiseVariationFact(data, admin, gridNeighborhood, minimum, maximum));
  }

  const score = useGrid ? (airScore + noiseScore) / 2 : commune!.score;
  const period = sourceReferencePeriod(data, sourceId);
  return available(
    "living-environment",
    score,
    positive.slice(0, 2),
    negative.slice(0, 2),
    undefined,
    [
      useGrid
        ? `Classe SIG air-bruit ${period} utilisée au point ; le benchmark communal reste la référence de secours.`
        : `Fallback explicite sur le benchmark communal air-bruit ${period} ; aucune classe SIG au point n’est disponible.`,
    ],
    neutral,
  );
}

function securitySignal(
  data: CompiledNeighborhoodVerdictData,
  admin: AdministrativeLocation,
  stale: Set<string>,
): VerdictCategorySignal {
  if (stale.has("ssmsi-communal-2025")) return unavailable("security");
  const commune = data.security.communes[admin.commune.code];
  if (!commune) {
    return unavailable("security", [
      "Moins de quatre indicateurs diffusables ou moins de 60 % du poids local.",
    ]);
  }
  const trend = stale.has("ssmsi-chronology")
    ? undefined
    : data.security.trends[admin.departmentCode];
  const contextual = trend ? contextualTrend(trend, commune.localScore) : undefined;
  const score = Math.max(
    0,
    Math.min(10, commune.localScore + (contextual?.adjustment ?? 0)),
  );
  const make = (
    polarity: "positive" | "negative" | "neutral",
    indicator: typeof commune.indicators[number],
  ): VerdictEvidence =>
    evidence({
      id: `security-${indicator.id}`,
      category: "security",
      polarity,
      family: indicator.id,
      priority: Math.round(indicator.weight * 100),
      scoreImpact:
        polarity === "positive" ? indicator.weight : polarity === "negative" ? -indicator.weight : 0,
      label:
        polarity === "positive"
          ? `${indicator.label} : faits enregistrés relativement peu fréquents`
          : polarity === "negative"
            ? `${indicator.label} : faits enregistrés relativement fréquents`
            : `${indicator.label} : ${rounded(indicator.rate)} ${indicator.unit}, percentile ${Math.round(indicator.percentile * 100)}`,
      explanation: `Taux ${rounded(indicator.rate)} ${indicator.unit}, percentile ${Math.round(indicator.percentile * 100)} parmi les communes franciliennes diffusables, année ${indicator.year}, pour la même unité. Il s’agit de faits enregistrés par la police et la gendarmerie.`,
      rule:
        polarity === "positive"
          ? "Point fort sous le 25e percentile."
          : polarity === "negative"
            ? "Point faible au-dessus du 75e percentile."
            : "Repère descriptif entre les 25e et 75e percentiles.",
      value: rounded(indicator.rate),
      unit: indicator.unit,
      geography: { level: "commune", code: admin.commune.code, name: admin.commune.name },
      referencePeriod: String(indicator.year),
      sourceIds: ["ssmsi-communal-2025"],
    });
  return available(
    "security",
    score,
    commune.indicators
      .filter((indicator) => indicator.percentile < 0.25)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2)
      .map((indicator) => make("positive", indicator)),
    commune.indicators
      .filter((indicator) => indicator.percentile > 0.75)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2)
      .map((indicator) => make("negative", indicator)),
    undefined,
    trend ? [] : ["Tendance départementale indisponible ; le niveau communal reste utilisable."],
    commune.indicators
      .filter((indicator) => indicator.percentile >= 0.25 && indicator.percentile <= 0.75)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)
      .map((indicator) => make("neutral", indicator)),
  );
}

function contextualTrend(
  trend: SecurityTrendResult,
  localScore: number,
): SecurityTrendResult {
  const trendScore = Math.max(0, Math.min(10, 5 - trend.deltaPercent / 10));
  const mixed = 0.9 * localScore + 0.1 * trendScore;
  return {
    ...trend,
    adjustment: roundNumber(Math.max(-0.5, Math.min(0.5, mixed - localScore))),
  };
}

function airNoiseFact(
  data: CompiledNeighborhoodVerdictData,
  kind: "air" | "noise",
  polarity: VerdictPolarity,
  score: number,
  admin: AdministrativeLocation,
  label: string,
  sourceId: string,
  geographyLevel: "point" | "commune" = "commune",
): VerdictEvidence {
  const period = sourceReferencePeriod(data, sourceId);
  const measurementNote = kind === "noise"
    ? " Il s’agit d’une classe d’exposition sonore, pas d’une mesure ponctuelle en décibels."
    : "";
  return evidence({
    id: `${kind}-${admin.commune.code}-${geographyLevel}`,
    category: "living-environment",
    polarity,
    family: kind,
    priority: 8,
    scoreImpact: polarity === "positive" ? 1 : polarity === "negative" ? -1 : 0,
    label,
    explanation: `Score ${rounded(score)}/10 calculé à partir des classes officielles d’exposition ${period}${geographyLevel === "point" ? " au point SIG" : " et des populations exposées de la commune"}.${measurementNote}`,
    rule: kind === "noise"
      ? "Niveau sonore converti dans l’ordre officiel de 0 à 10 ; le point neutre ne crée ni bonus ni malus."
      : "Classe air convertie dans l’ordre officiel de 0 à 10 ; le point neutre ne crée ni bonus ni malus.",
    value: rounded(score),
    unit: "/10",
    geography:
      geographyLevel === "point"
        ? { level: "point" }
        : { level: "commune", code: admin.commune.code, name: admin.commune.name },
    referencePeriod: period,
    sourceIds: [sourceId],
  });
}

function airNoiseVariationFact(
  data: CompiledNeighborhoodVerdictData,
  admin: AdministrativeLocation,
  neighborhood: AirNoiseGridNeighborhood,
  minimum: number,
  maximum: number,
): VerdictEvidence {
  const period = sourceReferencePeriod(data, AIR_NOISE_GRID_SOURCE_ID);
  const quietLevel = describeAirNoiseLevel("noise", maximum).label;
  const loudLevel = describeAirNoiseLevel("noise", minimum).label;
  return evidence({
    id: `noise-${admin.commune.code}-variation`,
    category: "living-environment",
    polarity: "neutral",
    family: "noise-variation",
    priority: 7,
    scoreImpact: 0,
    label: `Variation sonore autour de l’adresse : de ${quietLevel} à ${loudLevel} (${rounded(minimum)}–${rounded(maximum)}/10)`,
    explanation: `${neighborhood.classes.length} niveaux distincts ont été observés dans les mailles SIG voisines, sur environ ${neighborhood.radiusMeters} m autour du point. Le bruit peut donc changer d’une rue à l’autre ; ce repère ne remplace pas une mesure en décibels.`,
    rule: "Repère neutre : les variations locales sont affichées sans créer de bonus ni de malus.",
    value: `${rounded(minimum)}–${rounded(maximum)}`,
    unit: "/10",
    geography: { level: "point" },
    referencePeriod: period,
    sourceIds: [AIR_NOISE_GRID_SOURCE_ID],
  });
}

function sourceReferencePeriod(data: CompiledNeighborhoodVerdictData, sourceId: string): string {
  return data.sources.find((source) => source.id === sourceId)?.referencePeriod ?? "édition active";
}

function airNoisePolarity(score: number): VerdictPolarity {
  return score >= 7.5 ? "positive" : score <= 2.5 ? "negative" : "neutral";
}

export function describeAirNoiseLevel(kind: "air" | "noise", score: number): { label: string; polarity: VerdictPolarity } {
  const bounded = Math.max(0, Math.min(10, score));
  if (kind === "noise") {
    const label = bounded >= 9 ? "très calme"
      : bounded >= 7.5 ? "calme"
        : bounded >= 6 ? "plutôt calme"
          : bounded >= 4 ? "intermédiaire"
            : bounded > 2.5 ? "plutôt bruyant" : "bruyant";
    return { label, polarity: airNoisePolarity(bounded) };
  }
  const label = bounded >= 9 ? "très favorable"
    : bounded >= 7.5 ? "favorable"
      : bounded >= 6 ? "plutôt favorable"
        : bounded >= 4 ? "intermédiaire"
          : bounded > 2.5 ? "plutôt défavorable" : "défavorable";
  return { label, polarity: airNoisePolarity(bounded) };
}

function lookupAirNoiseCommune(
  communes: Record<string, CompiledAirNoiseCommune>,
  admin: AdministrativeLocation,
): CompiledAirNoiseCommune | undefined {
  const direct = communes[admin.commune.code];
  if (direct) return direct;
  // API Géo returns the parent commune code 75056 for Paris, while the
  // Airparif/Bruitparif workbook historically publishes one row per Paris
  // arrondissement. Aggregate those rows only as an explicit fallback.
  if (admin.commune.code !== "75056") return undefined;
  const arrondissements = Object.values(communes).filter((commune) => /^751\d{2}$/.test(commune.inseeCode));
  if (!arrondissements.length) return undefined;
  const weightOf = (commune: CompiledAirNoiseCommune): number => Math.max(
    commune.population,
    Object.values(commune.classPopulation).reduce((sum, value) => sum + value, 0),
  );
  const totalWeight = arrondissements.reduce((sum, commune) => sum + weightOf(commune), 0);
  if (!(totalWeight > 0)) return undefined;
  const weighted = (selector: (commune: CompiledAirNoiseCommune) => number): number => roundNumber(
    arrondissements.reduce((sum, commune) => sum + selector(commune) * weightOf(commune), 0) / totalWeight,
  );
  const classPopulation = Object.fromEntries(
    ["11", "12", "13", "21", "22", "23", "31", "32", "33"].map((className) => [
      className,
      arrondissements.reduce((sum, commune) => sum + (commune.classPopulation[className] ?? 0), 0),
    ]),
  );
  const dominantClass = Object.entries(classPopulation).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "22";
  return {
    inseeCode: admin.commune.code,
    name: admin.commune.name,
    departmentCode: admin.departmentCode,
    population: roundNumber(arrondissements.reduce((sum, commune) => sum + commune.population, 0)),
    score: weighted((commune) => commune.score),
    airScore: weighted((commune) => commune.airScore),
    noiseScore: weighted((commune) => commune.noiseScore),
    dominantClass,
    classPopulation,
  };
}

function available(
  id: VerdictCategoryId,
  score?: number,
  positiveFacts: VerdictEvidence[] = [],
  negativeFacts: VerdictEvidence[] = [],
  scoreDelta?: number,
  limitations: string[] = [],
  neutralFacts: VerdictEvidence[] = [],
): VerdictCategorySignal {
  return {
    id,
    status: "available",
    score,
    scoreDelta,
    coverageRatio: score === undefined && scoreDelta === undefined ? 0 : 1,
    positiveFacts,
    negativeFacts,
    neutralFacts,
    limitations,
  };
}

function unavailable(
  id: VerdictCategoryId,
  limitations: string[] = [],
): VerdictCategorySignal {
  return {
    id,
    status: "unavailable",
    coverageRatio: 0,
    positiveFacts: [],
    negativeFacts: [],
    neutralFacts: [],
    limitations,
  };
}

function evidence(
  input: Omit<VerdictEvidence, "proof" | "observedAt"> &
    Partial<Pick<VerdictEvidence, "proof" | "observedAt">>,
): VerdictEvidence {
  return { proof: "derived", observedAt: new Date().toISOString(), ...input };
}

function rounded(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 100) / 100;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface AirNoiseGridNeighborhood {
  pointClass?: string;
  classes: string[];
  radiusMeters: number;
}

/**
 * Look up the exact SIG cell and a compact ring of neighbouring cells. This
 * provides street-to-street variation without presenting the grid as a sound
 * level sensor.
 */
export function lookupAirNoiseGridNeighborhood(
  grid: CompiledAirNoiseGrid | undefined,
  lon: number,
  lat: number,
  radiusCells = 2,
): AirNoiseGridNeighborhood | undefined {
  const cell = gridCell(grid, lon, lat);
  if (!grid || !cell) return undefined;
  const radius = Math.max(0, Math.floor(radiusCells));
  const classes: string[] = [];
  for (let row = cell.row - radius; row <= cell.row + radius; row += 1) {
    for (let column = cell.column - radius; column <= cell.column + radius; column += 1) {
      const value = airNoiseGridValue(grid, column, row);
      if (value && /^[123][123]$/.test(value) && !classes.includes(value)) classes.push(value);
    }
  }
  const radiusMeters = Math.max(1, Math.round(radius * grid.cellSizeDegrees * 111_320 * Math.SQRT2));
  return { pointClass: airNoiseGridValue(grid, cell.column, cell.row), classes, radiusMeters };
}

function gridCell(
  grid: CompiledAirNoiseGrid | undefined,
  lon: number,
  lat: number,
): { column: number; row: number } | undefined {
  if (!grid || !Number.isFinite(grid.cellSizeDegrees) || grid.cellSizeDegrees <= 0) return undefined;
  if (lon < grid.bbox[0] || lon > grid.bbox[2] || lat < grid.bbox[1] || lat > grid.bbox[3]) return undefined;
  return {
    column: Math.max(0, Math.min(grid.columns - 1, Math.floor((lon - grid.bbox[0]) / grid.cellSizeDegrees))),
    row: Math.max(0, Math.min(grid.rows - 1, Math.floor((lat - grid.bbox[1]) / grid.cellSizeDegrees))),
  };
}

function airNoiseGridValue(grid: CompiledAirNoiseGrid, column: number, row: number): string | undefined {
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return undefined;
  const code = grid.classes[row * grid.columns + column];
  return code ? grid.values[code - 1] : undefined;
}

function componentAirNoiseScore(className: string, component: 0 | 1): number {
  if (!/^[123][123]$/.test(className)) return 5;
  return 10 - 5 * (Number(className[component]) - 1);
}

function distanceToGreenSpace(
  point: { lat: number; lon: number },
  space: CompiledGreenSpace,
): number {
  const rings =
    space.geometry.type === "Polygon"
      ? space.geometry.coordinates
      : space.geometry.coordinates.flat();
  if (rings.some((ring) => pointInRing(point, ring))) return 0;
  let minimum = Infinity;
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      minimum = Math.min(
        minimum,
        segmentDistance(point, ring[index - 1]!, ring[index]!),
      );
    }
  }
  return minimum;
}

function pointInRing(point: { lat: number; lon: number }, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      (yi > point.lat) !== (yj > point.lat) &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentDistance(
  point: { lat: number; lon: number },
  left: number[],
  right: number[],
): number {
  const scale = Math.cos((point.lat * Math.PI) / 180);
  const px = point.lon * scale;
  const py = point.lat;
  const ax = left[0]! * scale;
  const ay = left[1]!;
  const bx = right[0]! * scale;
  const by = right[1]!;
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
    : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111_320;
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * radians) *
      Math.cos(lat2 * radians) *
      Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
