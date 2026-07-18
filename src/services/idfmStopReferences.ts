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

export function monitoringRefToNavitiaStopPointRef(
  reference: string | null | undefined,
): string | undefined {
  const code = extractIdfmStopPointCode(reference);

  return code ? `${NAVITIA_STOP_POINT_PREFIX}${code}` : undefined;
}

export function createIdfmStopReferenceKeys(
  reference: string | null | undefined,
): string[] {
  const normalized = reference?.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const keys = [normalized];
  const code = extractIdfmStopPointCode(reference);

  if (code) {
    keys.push(`idfm-stop:${code.toLowerCase()}`);
  }

  return [...new Set(keys)];
}
