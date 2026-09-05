/**
 * Stable crosswalks for line ids that changed between the NeTEx cache and the
 * installed GTFS snapshot. Geometry consumers still validate the alias
 * against the requested stops before accepting it.
 */
const GTFS_LINE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // NeTEx keeps the legacy 30-46 identifier. The current GTFS snapshot
  // publishes this same Cormeilles corridor as 1425 (IDFM:C02851).
  "IDFM:C01876": ["IDFM:C02851"],
};

export function getGtfsLineAliasCandidates(lineId: string): string[] {
  const normalizedLineId = lineId.trim().replace(/^line:/iu, "").toLocaleUpperCase("en-US");
  return [...(GTFS_LINE_ALIASES[normalizedLineId] ?? [])];
}
