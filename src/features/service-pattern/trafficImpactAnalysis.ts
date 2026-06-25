import {
  getDisruptionTone,
  normalizeTrafficText,
} from "../traffic/trafficPresentation";
import type { TrafficDisruption } from "../traffic/types";
import { normalizePatternStationName } from "./stationKeys";

export type PatternTrafficImpactKind = "interruption" | "disturbance";

export interface PatternTrafficStation {
  key: string;
  label: string;
}

export interface PatternTrafficEdge {
  id?: string;
  source: string;
  target: string;
}

export interface PatternTrafficImpact {
  kind: PatternTrafficImpactKind;
  disruption: TrafficDisruption;
  restartTimeLabel?: string;
  replacementBus: boolean;
}

export interface PatternTrafficImpactSegment extends PatternTrafficImpact {
  id: string;
  stationKeys: string[];
  edgeKeys: string[];
}

export interface PatternTrafficImpactAnalysis {
  segments: PatternTrafficImpactSegment[];
  stationImpacts: Record<string, PatternTrafficImpact>;
  edgeImpacts: Record<string, PatternTrafficImpact>;
}

interface ParsedTrafficDisruption {
  kind: PatternTrafficImpactKind | undefined;
  sections: Array<{ from: string; to: string }>;
  restartTimeLabel?: string;
  replacementBus: boolean;
  disturbsRestOfLine: boolean;
}

const DISTURBANCE_KEYWORDS = [
  "trafic perturbe",
  "perturbe",
  "perturbation",
  "ralenti",
  "retard",
  "retards",
  "service reduit",
  "service adapte",
  "frequence reduite",
  "temps d attente allonge",
  "temps d attente allonges",
  "disturbed",
  "reduced service",
];

const INTERRUPTION_KEYWORDS = [
  "trafic interrompu",
  "interruption",
  "aucun train",
  "aucune circulation",
  "ne circule pas",
  "ne circulent pas",
  "trafic suspendu",
  "service suspendu",
  "fermeture",
  "no service",
  "no-service",
];

const REPLACEMENT_BUS_KEYWORDS = [
  "bus de remplacement",
  "bus relais",
  "bus de substitution",
  "navette",
  "navettes",
];

const SECTION_END_PATTERN =
  String.raw`(?=(?:\s+(?:et\s+(?:perturb|ralenti|interrompu|suspendu)|sur\s+le\s+reste|en\s+raison|suite|a\s+la\s+suite|pour\s+cause|toute\s+la|tous\s+les|du\s+\d|jusqu|reprise|veuillez)|[.;,\n]|$))`;

export function analyzeTrafficImpacts(
  disruptions: TrafficDisruption[],
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
): PatternTrafficImpactAnalysis {
  const analysis: PatternTrafficImpactAnalysis = {
    segments: [],
    stationImpacts: {},
    edgeImpacts: {},
  };
  const edgeKeys = edges.map(getPatternTrafficEdgeKey);

  disruptions.forEach((disruption) => {
    const parsed = parseTrafficDisruption(disruption);

    if (!parsed.kind && parsed.sections.length === 0) {
      return;
    }

    const baseImpact = createImpact(disruption, parsed, parsed.kind);
    const resolvedSegments = createResolvedSegments({
      disruption,
      parsed,
      stations,
      edges,
      kind: parsed.kind ?? "disturbance",
    });
    const interruptionEdgeKeys = new Set(
      resolvedSegments
        .filter((segment) => segment.kind === "interruption")
        .flatMap((segment) => segment.edgeKeys),
    );

    resolvedSegments.forEach((segment) => {
      applySegment(analysis, segment);
    });

    if (parsed.disturbsRestOfLine) {
      const restEdgeKeys = edgeKeys.filter(
        (edgeKey) => !interruptionEdgeKeys.has(edgeKey),
      );
      const restStationKeys = getStationKeysForEdges(restEdgeKeys, edges);

      if (restEdgeKeys.length > 0 || restStationKeys.length > 0) {
        applySegment(analysis, {
          ...baseImpact,
          id: `${disruption.id}:rest-of-line`,
          kind: "disturbance",
          edgeKeys: restEdgeKeys,
          stationKeys: restStationKeys,
        });
      }
    }
  });

  return analysis;
}

export function getInterruptedStations(
  analysis: PatternTrafficImpactAnalysis,
): string[] {
  return Object.entries(analysis.stationImpacts)
    .filter(([, impact]) => impact.kind === "interruption")
    .map(([stationKey]) => stationKey);
}

export function getDisturbedStations(
  analysis: PatternTrafficImpactAnalysis,
): string[] {
  return Object.entries(analysis.stationImpacts)
    .filter(([, impact]) => impact.kind === "disturbance")
    .map(([stationKey]) => stationKey);
}

export function getPatternTrafficEdgeKey(edge: PatternTrafficEdge): string {
  return [edge.source, edge.target].sort().join("--");
}

function parseTrafficDisruption(
  disruption: TrafficDisruption,
): ParsedTrafficDisruption {
  const text = getDisruptionText(disruption);
  const searchable = normalizeSearchText(text);
  const isInterruption =
    getDisruptionTone(disruption) === "red" ||
    INTERRUPTION_KEYWORDS.some((keyword) => searchable.includes(keyword));
  const isDisturbance = DISTURBANCE_KEYWORDS.some((keyword) =>
    searchable.includes(keyword),
  );

  return {
    kind: isInterruption
      ? "interruption"
      : isDisturbance
        ? "disturbance"
        : undefined,
    sections: extractTrafficSections(text),
    restartTimeLabel: extractRestartTimeLabel(text),
    replacementBus: REPLACEMENT_BUS_KEYWORDS.some((keyword) =>
      searchable.includes(keyword),
    ),
    disturbsRestOfLine:
      isDisturbance &&
      /\b(?:reste|restant|restante)\s+de\s+la\s+ligne\b/u.test(searchable),
  };
}

function createResolvedSegments({
  disruption,
  parsed,
  stations,
  edges,
  kind,
}: {
  disruption: TrafficDisruption;
  parsed: ParsedTrafficDisruption;
  stations: PatternTrafficStation[];
  edges: PatternTrafficEdge[];
  kind: PatternTrafficImpactKind;
}): PatternTrafficImpactSegment[] {
  const segments = parsed.sections
    .map((section, index) => {
      const source = resolveStationKey(section.from, stations);
      const target = resolveStationKey(section.to, stations);

      if (!source || !target) {
        return undefined;
      }

      return createSegmentFromEndpoints({
        disruption,
        parsed,
        edges,
        kind,
        source,
        target,
        index,
      });
    })
    .filter(
      (segment): segment is PatternTrafficImpactSegment => Boolean(segment),
    );

  if (segments.length > 0) {
    return segments;
  }

  const impactedStationKeys = disruption.impactedStopNames
    .map((name) => resolveStationKey(name, stations))
    .filter((key): key is string => Boolean(key));

  if (impactedStationKeys.length >= 2) {
    return [
      createSegmentFromEndpoints({
        disruption,
        parsed,
        edges,
        kind,
        source: impactedStationKeys[0],
        target: impactedStationKeys[impactedStationKeys.length - 1],
        index: 0,
      }),
    ];
  }

  if (impactedStationKeys.length === 1) {
    return [
      {
        ...createImpact(disruption, parsed, kind),
        id: `${disruption.id}:station:${impactedStationKeys[0]}`,
        stationKeys: impactedStationKeys,
        edgeKeys: [],
      },
    ];
  }

  return [];
}

function createSegmentFromEndpoints({
  disruption,
  parsed,
  edges,
  kind,
  source,
  target,
  index,
}: {
  disruption: TrafficDisruption;
  parsed: ParsedTrafficDisruption;
  edges: PatternTrafficEdge[];
  kind: PatternTrafficImpactKind;
  source: string;
  target: string;
  index: number;
}): PatternTrafficImpactSegment {
  const stationKeys = findStationPath(source, target, edges);
  const edgeKeys = getEdgeKeysForStationPath(stationKeys);

  return {
    ...createImpact(disruption, parsed, kind),
    id: `${disruption.id}:section:${index}`,
    stationKeys,
    edgeKeys,
  };
}

function createImpact(
  disruption: TrafficDisruption,
  parsed: ParsedTrafficDisruption,
  fallbackKind: PatternTrafficImpactKind | undefined,
): PatternTrafficImpact {
  return {
    kind: parsed.kind ?? fallbackKind ?? "disturbance",
    disruption,
    restartTimeLabel: parsed.restartTimeLabel,
    replacementBus: parsed.replacementBus,
  };
}

function applySegment(
  analysis: PatternTrafficImpactAnalysis,
  segment: PatternTrafficImpactSegment,
): void {
  analysis.segments.push(segment);

  segment.stationKeys.forEach((stationKey) => {
    analysis.stationImpacts[stationKey] = chooseStrongerImpact(
      analysis.stationImpacts[stationKey],
      segment,
    );
  });

  segment.edgeKeys.forEach((edgeKey) => {
    analysis.edgeImpacts[edgeKey] = chooseStrongerImpact(
      analysis.edgeImpacts[edgeKey],
      segment,
    );
  });
}

function chooseStrongerImpact(
  existing: PatternTrafficImpact | undefined,
  next: PatternTrafficImpact,
): PatternTrafficImpact {
  if (!existing || getImpactPriority(next) > getImpactPriority(existing)) {
    return next;
  }

  return existing;
}

function getImpactPriority(impact: PatternTrafficImpact): number {
  return impact.kind === "interruption" ? 2 : 1;
}

function extractTrafficSections(
  text: string,
): Array<{ from: string; to: string }> {
  const sections: Array<{ from: string; to: string }> = [];
  const regexes = [
    new RegExp(
      String.raw`\bentre\s+(.+?)\s+et\s+(.+?)${SECTION_END_PATTERN}`,
      "giu",
    ),
    new RegExp(
      String.raw`\bdepuis\s+(.+?)\s+jusqu(?:'|’)?[aà]\s+(.+?)${SECTION_END_PATTERN}`,
      "giu",
    ),
    new RegExp(
      String.raw`\bde\s+(.+?)\s+(?:a|à|vers|jusqu(?:'|’)?[aà])\s+(.+?)${SECTION_END_PATTERN}`,
      "giu",
    ),
  ];

  regexes.forEach((regex) => {
    for (const match of text.matchAll(regex)) {
      const from = cleanSectionStationLabel(match[1]);
      const to = cleanSectionStationLabel(match[2]);

      if (from && to) {
        sections.push({ from, to });
      }
    }
  });

  return sections;
}

function cleanSectionStationLabel(value?: string): string {
  return (value ?? "")
    .replace(/\s+/gu, " ")
    .replace(/^[\s:,-]+|[\s:,-]+$/gu, "")
    .trim();
}

function extractRestartTimeLabel(text: string): string | undefined {
  const normalized = normalizeTrafficText(text);
  const match = normalized.match(
    /(?:reprise|retablissement|retour a la normale|fin)\s+(?:estimee|prevue)?\s*(?::|a|vers|pour)?\s*(minuit|midi|\d{1,2}(?::|h)\d{2}|\d{1,2}h)\b/u,
  );

  if (!match) {
    return undefined;
  }

  return formatRestartTimeLabel(match[1]);
}

function formatRestartTimeLabel(value: string): string {
  if (value === "minuit") {
    return "00:00";
  }

  if (value === "midi") {
    return "12:00";
  }

  const [hourText, minuteText = "00"] = value.replace("h", ":").split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function resolveStationKey(
  label: string,
  stations: PatternTrafficStation[],
): string | undefined {
  const labelKey = normalizePatternStationName(label);

  if (!labelKey) {
    return undefined;
  }

  const candidates = stations
    .map((station) => ({
      station,
      stationKey: normalizePatternStationName(station.label),
    }))
    .filter(({ stationKey }) =>
      stationKey === labelKey ||
      stationKey.includes(labelKey) ||
      labelKey.includes(stationKey),
    )
    .sort((left, right) => right.stationKey.length - left.stationKey.length);

  return candidates[0]?.station.key;
}

function findStationPath(
  source: string,
  target: string,
  edges: PatternTrafficEdge[],
): string[] {
  if (source === target) {
    return [source];
  }

  const adjacency = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, new Set());
    }
    if (!adjacency.has(edge.target)) {
      adjacency.set(edge.target, new Set());
    }

    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  });

  const queue: string[][] = [[source]];
  const visited = new Set<string>([source]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];

    for (const next of adjacency.get(last) ?? []) {
      if (visited.has(next)) {
        continue;
      }

      const nextPath = [...path, next];

      if (next === target) {
        return nextPath;
      }

      visited.add(next);
      queue.push(nextPath);
    }
  }

  return [source, target];
}

function getEdgeKeysForStationPath(stationKeys: string[]): string[] {
  return stationKeys.slice(0, -1).map((source, index) =>
    [source, stationKeys[index + 1]].sort().join("--"),
  );
}

function getStationKeysForEdges(
  edgeKeys: string[],
  edges: PatternTrafficEdge[],
): string[] {
  const selectedEdgeKeys = new Set(edgeKeys);
  const stationKeys = new Set<string>();

  edges.forEach((edge) => {
    if (!selectedEdgeKeys.has(getPatternTrafficEdgeKey(edge))) {
      return;
    }

    stationKeys.add(edge.source);
    stationKeys.add(edge.target);
  });

  return Array.from(stationKeys);
}

function getDisruptionText(disruption: TrafficDisruption): string {
  return [
    disruption.title,
    disruption.message,
    disruption.severity,
    disruption.cause,
    disruption.status,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function normalizeSearchText(value: string): string {
  return normalizeTrafficText(value)
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
