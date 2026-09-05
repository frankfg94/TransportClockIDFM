import type {
  TrafficDisruption,
  TrafficDisruptionKind,
  TrafficLineReport,
  TrafficLineStatus,
} from "./types";
import { parseTrafficDate } from "./trafficTiming";
import { mergeEquivalentTrafficDisruptions } from "./trafficDisruptionMerging";

type JsonRecord = Record<string, unknown>;

export function normalizeNavitiaLineReportPayload(
  payload: unknown,
  fallbackLineRef: string,
): TrafficDisruption[] {
  const root = asRecord(payload);
  const lineReports = asArray(root.line_reports);
  const rootDisruptions = asArray(root.disruptions);
  const lineReportDisruptions = lineReports.flatMap((lineReport) => {
    const report = asRecord(lineReport);
    return asArray(report.disruptions);
  });
  const linkedDisruptionIds = extractLineReportDisruptionIds(lineReports);
  const linkedRootDisruptions = linkedDisruptionIds.size
    ? rootDisruptions.filter((item) => {
        const disruption = asRecord(item);
        const id = asText(disruption.id);
        return id ? linkedDisruptionIds.has(id) : false;
      })
    : rootDisruptions;
  // Navitia line_reports can expose disruptions either directly on each
  // line_report or once at the payload root with links from the line report.
  // Keep both shapes so long-running issues such as Tram T1 are not lost.
  const sourceDisruptions = [...linkedRootDisruptions, ...lineReportDisruptions];
  const disruptionsById = new Map<string, TrafficDisruption>();

  sourceDisruptions.forEach((item, index) => {
    const disruption = normalizeDisruption(item, fallbackLineRef, index);

    if (disruption) {
      disruptionsById.set(disruption.id, disruption);
    }
  });

  const normalizedLineRef = normalizeTrafficLineRef(fallbackLineRef);

  return mergeEquivalentTrafficDisruptions(
    enrichMissingWorkMotifs(Array.from(disruptionsById.values())),
  ).filter((disruption) => disruption.impactedLineRefs.includes(normalizedLineRef));
}

/**
 * Normalize the IDFM `idfm-disruptions_bulk` response into the same line
 * reports consumed by the map and the other traffic views. The bulk API is
 * intentionally treated as an index: only lines present in the payload are
 * returned, while a missing line is equivalent to a normal line for callers.
 */
export function normalizeIdfmGlobalTrafficPayload(
  payload: unknown,
): TrafficLineReport[] {
  const payloadRecord = asRecord(payload);
  const nestedData = asOptionalRecord(payloadRecord.data);
  const root = nestedData ?? payloadRecord;
  const lineRecords = asArray(root.lines)
    .map(asOptionalRecord)
    .filter((line): line is JsonRecord => Boolean(line));
  const disruptionRecords = asArray(root.disruptions);
  const lineRefs = new Set<string>();
  const disruptionIdsByLine = new Map<string, Set<string>>();
  const impactedStopNamesByLine = new Map<
    string,
    Map<string, Set<string>>
  >();

  lineRecords.forEach((line) => {
    const lineRef = normalizeBulkLineRef(line);
    if (!lineRef) return;
    lineRefs.add(lineRef);

    const linkedIds = extractLinkedDisruptionIds(line);
    extractBulkImpactedObjects(line).forEach((impactedObject) => {
      const impactedIds = extractLinkedDisruptionIds(impactedObject);
      impactedIds.forEach((id) => linkedIds.add(id));

      const impactedType = normalizeText(
        asText(impactedObject.type) ??
          asText(impactedObject.objectType) ??
          "",
      );
      const impactedName = asText(impactedObject.name);

      if (impactedType !== "line" && impactedName) {
        impactedIds.forEach((id) =>
          addBulkStopName(
            impactedStopNamesByLine,
            lineRef,
            id,
            impactedName,
          ),
        );
      }
    });

    if (linkedIds.size > 0) disruptionIdsByLine.set(lineRef, linkedIds);
  });

  const normalizedDisruptions = disruptionRecords.flatMap((item, index) => {
    const disruption = normalizeDisruption(item, "", index);
    return disruption ? [disruption] : [];
  });
  const disruptionsById = new Map(
    normalizedDisruptions.map((disruption) => [disruption.id, disruption]),
  );
  const disruptionsByLine = new Map<string, Map<string, TrafficDisruption>>();

  normalizedDisruptions.forEach((disruption) => {
    disruption.impactedLineRefs.forEach((lineRef) => {
      lineRefs.add(lineRef);
      addDisruptionToLine(disruptionsByLine, lineRef, disruption);
    });
  });

  disruptionIdsByLine.forEach((ids, lineRef) => {
    ids.forEach((id) => {
      const disruption = disruptionsById.get(id);
      if (!disruption) return;

      const stopNames = impactedStopNamesByLine.get(lineRef)?.get(id) ?? [];
      addDisruptionToLine(disruptionsByLine, lineRef, {
        ...disruption,
        impactedLineRefs: Array.from(
          new Set([...disruption.impactedLineRefs, lineRef]),
        ),
        impactedStopNames: Array.from(
          new Set([...disruption.impactedStopNames, ...stopNames]),
        ),
      });
    });
  });

  return Array.from(lineRefs).sort().map((lineRef) => {
    const disruptions = mergeEquivalentTrafficDisruptions(
      enrichMissingWorkMotifs(
        Array.from(disruptionsByLine.get(lineRef)?.values() ?? []),
      ),
    );

    return {
      lineRef,
      status: getTrafficLineStatus(disruptions),
      disruptions,
    };
  });
}

export function getTrafficLineStatus(
  disruptions: TrafficDisruption[],
  error?: string,
): TrafficLineStatus {
  if (error) {
    return "error";
  }

  if (disruptions.length === 0) {
    return "normal";
  }

  if (
    disruptions.some(
      (disruption) =>
        disruption.kind === "incident" || isSevereTrafficIssue(disruption),
    )
  ) {
    return "disrupted";
  }

  if (disruptions.every((disruption) => disruption.kind === "works")) {
    return "planned";
  }

  return "information";
}

export function normalizeTrafficLineRef(value: string): string {
  const code = value.match(/C\d{5}/iu)?.[0]?.toUpperCase();

  return code ? `line:IDFM:${code}` : value.trim();
}

function normalizeDisruption(
  value: unknown,
  fallbackLineRef: string,
  index: number,
): TrafficDisruption | undefined {
  const disruption = asRecord(value);

  if (!disruption) {
    return undefined;
  }

  const messages = extractMessageTexts(disruption.messages);
  const title =
    asDisplayText(disruption.title) ??
    asDisplayText(disruption.summary) ??
    messages[0] ??
    "Information trafic";
  const message =
    asDisplayText(disruption.message) ??
    asDisplayText(disruption.description) ??
    messages.slice(asText(disruption.title) ? 0 : 1).join("\n");
  const cause =
    asDisplayText(disruption.cause) ??
    asDisplayText(disruption.reason) ??
    asDisplayText(disruption.motif);
  const severity = getSeverityLabel(disruption.severity);
  const impactedLineRefs = extractImpactedLineRefs(
    disruption,
    fallbackLineRef,
  );

  if (isIgnoredAccessibilityEquipmentIssue(`${title} ${message} ${cause}`)) {
    return undefined;
  }

  return {
    id: asText(disruption.id) ?? createFallbackDisruptionId(title, index),
    title,
    message: message || undefined,
    kind: getDisruptionKind(disruption, `${title} ${message} ${cause}`),
    severity,
    cause,
    status: asText(disruption.status),
    updatedAt:
      asText(disruption.updated_at) ??
      asText(disruption.updatedAt) ??
      asText(disruption.last_update) ??
      asText(disruption.lastUpdate),
    applicationPeriods: extractApplicationPeriods(disruption),
    impactedLineRefs,
    impactedStopNames: extractImpactedStopNames(disruption),
  };
}

function enrichMissingWorkMotifs(
  disruptions: TrafficDisruption[],
): TrafficDisruption[] {
  const disruptionsWithMotifs = disruptions.flatMap((disruption) => {
    const motif = extractExplicitTrafficMotif(disruption.message);

    return motif ? [{ disruption, motif }] : [];
  });

  if (disruptionsWithMotifs.length === 0) {
    return disruptions;
  }

  return disruptions.map((disruption) => {
    if (
      disruption.kind !== "works" ||
      extractExplicitTrafficMotif(disruption.message)
    ) {
      return disruption;
    }

    const relatedMotifs = new Set(
      disruptionsWithMotifs
        .filter(
          ({ disruption: candidate }) =>
            candidate.id !== disruption.id &&
            candidate.kind === "works" &&
            hasSameWorkCause(disruption, candidate) &&
            hasOverlappingApplicationPeriods(disruption, candidate),
        )
        .map(({ motif }) => motif),
    );

    return relatedMotifs.size === 1
      ? { ...disruption, motif: Array.from(relatedMotifs)[0] }
      : disruption;
  });
}

function extractExplicitTrafficMotif(value?: string): string | undefined {
  if (!value) return undefined;

  const match = /\bmotif\s*:\s*[^\r\n]+/iu.exec(value);
  return match?.[0].trim();
}

function hasSameWorkCause(
  left: TrafficDisruption,
  right: TrafficDisruption,
): boolean {
  const leftCause = normalizeText(left.cause ?? "");
  const rightCause = normalizeText(right.cause ?? "");

  return Boolean(leftCause) && leftCause === rightCause;
}

function hasOverlappingApplicationPeriods(
  left: TrafficDisruption,
  right: TrafficDisruption,
): boolean {
  return left.applicationPeriods.some((leftPeriod) => {
    const leftStart = parseTrafficDate(leftPeriod.begin)?.getTime();
    const leftEnd = parseTrafficDate(leftPeriod.end)?.getTime();

    if (leftStart === undefined || leftEnd === undefined) return false;

    return right.applicationPeriods.some((rightPeriod) => {
      const rightStart = parseTrafficDate(rightPeriod.begin)?.getTime();
      const rightEnd = parseTrafficDate(rightPeriod.end)?.getTime();

      return (
        rightStart !== undefined &&
        rightEnd !== undefined &&
        leftStart < rightEnd &&
        rightStart < leftEnd
      );
    });
  });
}
function getDisruptionKind(
  disruption: JsonRecord,
  searchableText: string,
): TrafficDisruptionKind {
  const category = asText(disruption.category);
  const normalized = normalizeText(`${category ?? ""} ${searchableText}`);

  if (
    normalized.includes("travaux") ||
    normalized.includes("work") ||
    normalized.includes("maintenance")
  ) {
    return "works";
  }

  if (
    normalized.includes("incident") ||
    normalized.includes("interruption") ||
    normalized.includes("perturb") ||
    normalized.includes("greve") ||
    normalized.includes("strike")
  ) {
    return "incident";
  }

  if (
    normalized.includes("information") ||
    normalized.includes("message") ||
    normalized.includes("service")
  ) {
    return "information";
  }

  return "unknown";
}

function isSevereTrafficIssue(disruption: TrafficDisruption): boolean {
  const normalized = normalizeText(
    `${disruption.severity ?? ""} ${disruption.status ?? ""}`,
  );

  return [
    "blocking",
    "bloquant",
    "no service",
    "no-service",
    "reduced service",
    "perturbed",
    "disturbed",
  ].some((needle) => normalized.includes(needle));
}

function isIgnoredAccessibilityEquipmentIssue(searchableText: string): boolean {
  const normalized = normalizeText(searchableText).replace(
    /[^a-z0-9]+/gu,
    " ",
  );

  return [
    "panne ascenseur",
    "panne de l ascenseur",
    "panne d un ascenseur",
    "panne d ascenseur",
    "panne de l elevateur",
    "ascenseur indisponible",
    "elevator outage",
    "lift outage",
  ].some((needle) => normalized.includes(needle));
}

function extractMessageTexts(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      const message = asRecord(item);
      return (
        asDisplayText(message.text) ??
        asDisplayText(message.value) ??
        asDisplayText(message.message)
      );
    })
    .filter((item): item is string => Boolean(item));
}

function getSeverityLabel(value: unknown): string | undefined {
  const severity = asRecord(value);

  return (
    asText(value) ??
    asText(severity.name) ??
    asText(severity.effect) ??
    asText(severity.label)
  );
}

function extractApplicationPeriods(disruption: JsonRecord) {
  return [
    ...asArray(disruption.application_periods),
    ...asArray(disruption.applicationPeriods),
  ]
    .map((period) => {
      const record = asRecord(period);

      return {
        begin: asText(record.begin) ?? asText(record.start),
        end: asText(record.end) ?? asText(record.finish),
      };
    })
    .filter((period) => period.begin || period.end);
}

function extractImpactedLineRefs(
  disruption: JsonRecord,
  fallbackLineRef: string,
): string[] {
  const lineRefs = new Set<string>();

  asArray(disruption.lines).forEach((line) => {
    const record = asRecord(line);
    const lineRef = asText(record.id) ?? asText(record.ref);

    if (lineRef) {
      lineRefs.add(normalizeTrafficLineRef(lineRef));
    }
  });

  extractImpactedObjects(disruption).forEach((object) => {
    const ptObject = asOptionalRecord(object.pt_object) ?? object;
    const embeddedType = normalizeText(
      asText(ptObject.embedded_type) ??
        asText(ptObject.embeddedType) ??
        asText(ptObject.type) ??
        asText(ptObject.objectType) ??
        "",
    );
    const line = asRecord(ptObject.line);
    const lineRef =
      (embeddedType === "line"
        ? asText(ptObject.id) ?? asText(ptObject.ref)
        : undefined) ??
      asText(line.id) ??
      asText(line.ref);

    if (lineRef) {
      lineRefs.add(normalizeTrafficLineRef(lineRef));
    }
  });

  if (lineRefs.size === 0 && fallbackLineRef) {
    lineRefs.add(normalizeTrafficLineRef(fallbackLineRef));
  }

  return Array.from(lineRefs);
}

function extractLineReportDisruptionIds(lineReports: unknown[]): Set<string> {
  const disruptionIds = new Set<string>();

  lineReports.forEach((lineReport) => {
    const report = asRecord(lineReport);
    const line = asRecord(report.line);
    [...asArray(report.links), ...asArray(line.links)].forEach((link) => {
      const record = asRecord(link);
      const relation = normalizeText(asText(record.rel) ?? asText(record.relationship) ?? "");

      if (!relation.includes("disruption")) return;

      const id = asText(record.id);
      if (id) disruptionIds.add(id);
    });
  });

  return disruptionIds;
}

function extractImpactedStopNames(disruption: JsonRecord): string[] {
  const names = new Set<string>();

  extractImpactedObjects(disruption).forEach((object) => {
    const ptObject = asOptionalRecord(object.pt_object) ?? object;
    const embeddedType = normalizeText(
      asText(ptObject.embedded_type) ??
        asText(ptObject.embeddedType) ??
        asText(ptObject.type) ??
        asText(ptObject.objectType) ??
        "",
    );
    const name = asText(ptObject.name);

    if (name && embeddedType !== "line") {
      names.add(name);
    }

    const impactedSection =
      asOptionalRecord(object.impacted_section) ??
      asOptionalRecord(object.impactedSection);

    for (const endpointKey of ["from", "to"]) {
      const endpoint = asOptionalRecord(impactedSection?.[endpointKey]);
      const stopArea = asOptionalRecord(endpoint?.stop_area);
      const endpointName = asText(endpoint?.name) ?? asText(stopArea?.name);

      if (endpointName) {
        names.add(endpointName);
      }
    }
  });

  return Array.from(names);
}

function extractImpactedObjects(disruption: JsonRecord): JsonRecord[] {
  return [
    ...asArray(disruption.impacted_objects),
    ...asArray(disruption.impactedObjects),
  ]
    .map(asOptionalRecord)
    .filter((object): object is JsonRecord => Boolean(object));
}

function extractBulkImpactedObjects(line: JsonRecord): JsonRecord[] {
  return [
    ...asArray(line.impactedObjects),
    ...asArray(line.impacted_objects),
  ]
    .map(asOptionalRecord)
    .filter((object): object is JsonRecord => Boolean(object));
}

function normalizeBulkLineRef(line: JsonRecord): string | undefined {
  const lineRef = asText(line.id) ?? asText(line.ref) ?? asText(line.lineRef);
  return lineRef ? normalizeTrafficLineRef(lineRef) : undefined;
}

function extractLinkedDisruptionIds(line: JsonRecord): Set<string> {
  const ids = new Set<string>();
  const values = [
    ...asArray(line.disruptions),
    ...asArray(line.disruptionIds),
    ...asArray(line.disruption_ids),
  ];

  values.forEach((value) => {
    const record = asOptionalRecord(value);
    const id = asText(record?.id) ?? asText(value);
    if (id) ids.add(id);
  });

  return ids;
}

function addBulkStopName(
  stopNamesByLine: Map<string, Map<string, Set<string>>>,
  lineRef: string,
  disruptionId: string,
  stopName: string,
): void {
  const lineStopNames = stopNamesByLine.get(lineRef) ?? new Map();
  const stopNames = lineStopNames.get(disruptionId) ?? new Set<string>();
  stopNames.add(stopName);
  lineStopNames.set(disruptionId, stopNames);
  stopNamesByLine.set(lineRef, lineStopNames);
}

function addDisruptionToLine(
  disruptionsByLine: Map<string, Map<string, TrafficDisruption>>,
  lineRef: string,
  disruption: TrafficDisruption,
): void {
  const disruptions = disruptionsByLine.get(lineRef) ?? new Map();
  disruptions.set(disruption.id, disruption);
  disruptionsByLine.set(lineRef, disruptions);
}

function createFallbackDisruptionId(title: string, index: number): string {
  return `${normalizeText(title).replace(/[^a-z0-9]+/gu, "-")}-${index}`;
}

function asRecord(value: unknown): JsonRecord {
  return asOptionalRecord(value) ?? {};
}

function asOptionalRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" ? (value as JsonRecord) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asDisplayText(value: unknown): string | undefined {
  const text = asText(value);

  return text ? cleanDisplayText(text) : undefined;
}

function cleanDisplayText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p\s*>/giu, "\n")
    .replace(/<p\s*[^>]*>/giu, "")
    .replace(/<\/?[a-z][^>]*>/giu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity) => {
    const normalizedEntity = String(entity).toLowerCase();

    if (normalizedEntity.startsWith("#x")) {
      return decodeCodePoint(normalizedEntity.slice(2), 16) ?? match;
    }

    if (normalizedEntity.startsWith("#")) {
      return decodeCodePoint(normalizedEntity.slice(1), 10) ?? match;
    }

    const namedEntities: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
    };

    return namedEntities[normalizedEntity] ?? match;
  });
}

function decodeCodePoint(value: string, radix: number): string | undefined {
  const codePoint = Number.parseInt(value, radix);

  if (!Number.isFinite(codePoint)) {
    return undefined;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return undefined;
  }
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
