const NAVITIA_STOP_POINT_PREFIX = "stop_point:IDFM:";

/** Extracts the common IDFM code from SIRI, Navitia and NeTEx stop refs. */
export function extractIdfmStopPointCode(
  reference: string | null | undefined,
): string | undefined {
  const value = reference?.trim();

  if (!value || /monomodalStopPlace/iu.test(value)) {
    return undefined;
  }

  const match =
    value.match(/(?:^|:)StopPoint:Q:([^:]+)(?::|$)/iu) ??
    value.match(/^stop_point:IDFM:([^:]+)$/iu) ??
    value.match(/(?:^|:)Quay:([^:]+)(?::|$)/iu) ??
    value.match(/(?:^|:)ScheduledStopPoint:([^:]+)(?::|$)/iu);

  return match?.[1]?.trim() || undefined;
}

export function navitiaStopPointToMonitoringRef(
  reference: string | null | undefined,
): string | undefined {
  const code = extractIdfmStopPointCode(reference);

  return code ? `STIF:StopPoint:Q:${code}:` : undefined;
}

export function idfmReferenceToMonitoringRef(
  reference: string | null | undefined,
): string | undefined {
  const stopPointCode = extractIdfmStopPointCode(reference);

  if (stopPointCode) {
    return `STIF:StopPoint:Q:${stopPointCode}:`;
  }

  const stopAreaCode = extractIdfmStopAreaCode(reference);
  return stopAreaCode ? `STIF:StopArea:SP:${stopAreaCode}:` : undefined;
}

export function idfmLineToSiriRef(reference: string): string {
  if (/^STIF:Line::[^:]+:$/iu.test(reference)) return reference;

  const lineCode = reference.match(/^line:IDFM:([^:]+)$/iu)?.[1]
    ?? reference.match(/(?:^|:)Line:(?:IDFM:)?([^:]+)(?::|$)/iu)?.[1]
    ?? reference.split(":").filter(Boolean).at(-1)
    ?? reference;

  return `STIF:Line::${lineCode}:`;
}

export function monitoringRefToNavitiaStopPointRef(
  reference: string | null | undefined,
): string | undefined {
  const code = extractIdfmStopPointCode(reference);

  return code ? `${NAVITIA_STOP_POINT_PREFIX}${code}` : undefined;
}

/** Convert an attached SIRI stop-area ref to the Navitia stop-area id used by
 * the theoretical schedule endpoint. */
export function monitoringRefToNavitiaStopAreaRef(
  reference: string | null | undefined,
): string | undefined {
  const code = extractIdfmStopAreaCode(reference);

  return code ? `stop_area:IDFM:${code}` : undefined;
}

export function createIdfmStopReferenceKeys(
  reference: string | null | undefined,
): string[] {
  const normalized = reference?.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const keys = [normalized, normalized.replace(/^station:/u, "")];
  const code = extractIdfmStopPointCode(reference);
  const stopAreaCode = extractIdfmStopAreaCode(reference);

  if (code) {
    keys.push(`idfm-stop:${code.toLowerCase()}`);
  }

  if (stopAreaCode) {
    keys.push(`idfm-stop-area:${stopAreaCode.toLowerCase()}`);
  }

  return [...new Set(keys)];
}

function extractIdfmStopAreaCode(
  reference: string | null | undefined,
): string | undefined {
  const value = reference?.trim();
  if (!value) return undefined;

  return (
    value.match(/(?:^|:)(?:monomodalStopPlace|multimodalStopPlace):([^:]+)(?::|$)/iu)?.[1] ??
    value.match(/^stop_area:IDFM:([^:]+)$/iu)?.[1] ??
    value.match(/(?:^|:)StopArea:SP:([^:]+)(?::|$)/iu)?.[1]
  )?.trim() || undefined;
}
