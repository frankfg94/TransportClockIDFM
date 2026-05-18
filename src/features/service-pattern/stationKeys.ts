export interface PatternStationKeySource {
  id?: string;
  label: string;
  station?: { scheduleStopAreaRef?: string };
  stopAreaRef?: string;
}

export function createPatternStationKey(stop: PatternStationKeySource): string {
  const labelKey = normalizePatternStationName(stop.label);

  if (labelKey) {
    return labelKey;
  }

  return normalizePatternStationName(
    stop.station?.scheduleStopAreaRef ??
      stop.stopAreaRef ??
      getStableTopologyStopId(stop.id) ??
      stop.label,
  );
}

export function patternStationKeysAreCompatible(
  left: string,
  right: string,
): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const shortestLength = Math.min(left.length, right.length);

  return shortestLength >= 6 && (left.includes(right) || right.includes(left));
}

export function normalizePatternStationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function getStableTopologyStopId(id?: string): string | undefined {
  if (!id || id.startsWith("call:")) {
    return undefined;
  }

  return id;
}
