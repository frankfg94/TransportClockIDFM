import type {
  TrafficDisruption,
  TrafficDisruptionKind,
  TrafficLineStatus,
} from "./types";
import { parseTrafficDate } from "./trafficTiming";

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
  // Navitia line_reports can expose disruptions either directly on each
  // line_report or once at the payload root with links from the line report.
  // Keep both shapes so long-running issues such as Tram T1 are not lost.
  const sourceDisruptions = [...rootDisruptions, ...lineReportDisruptions];
  const disruptionsById = new Map<string, TrafficDisruption>();

  sourceDisruptions.forEach((item, index) => {
    const disruption = normalizeDisruption(item, fallbackLineRef, index);

    if (disruption) {
      disruptionsById.set(disruption.id, disruption);
    }
  });

  return enrichMissingWorkMotifs(Array.from(disruptionsById.values()));
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
    updatedAt: asText(disruption.updated_at) ?? asText(disruption.updatedAt),
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
  const lineRefs = new Set<string>([normalizeTrafficLineRef(fallbackLineRef)]);

  asArray(disruption.lines).forEach((line) => {
    const record = asRecord(line);
    const lineRef = asText(record.id) ?? asText(record.ref);

    if (lineRef) {
      lineRefs.add(normalizeTrafficLineRef(lineRef));
    }
  });

  extractImpactedObjects(disruption).forEach((object) => {
    const ptObject = asOptionalRecord(object.pt_object) ?? object;
    const embeddedType = normalizeText(asText(ptObject.embedded_type) ?? "");
    const line = asRecord(ptObject.line);
    const lineRef =
      (embeddedType === "line" ? asText(ptObject.id) : undefined) ??
      asText(line.id) ??
      asText(line.ref);

    if (lineRef) {
      lineRefs.add(normalizeTrafficLineRef(lineRef));
    }
  });

  return Array.from(lineRefs);
}

function extractImpactedStopNames(disruption: JsonRecord): string[] {
  const names = new Set<string>();

  extractImpactedObjects(disruption).forEach((object) => {
    const ptObject = asOptionalRecord(object.pt_object) ?? object;
    const embeddedType = normalizeText(asText(ptObject.embedded_type) ?? "");
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
