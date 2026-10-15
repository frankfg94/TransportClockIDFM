import type { TranslationKey, TranslationParams } from "../../../i18n";
import type { NeighborhoodFact } from "./contracts";

/** Shared by the summary and the detailed card, including tooltips. */
export function transportSectionValues(
  fact: NeighborhoodFact,
  values: TranslationParams | undefined,
  t: (key: TranslationKey, values?: TranslationParams) => string,
): TranslationParams | undefined {
  const section = fact.transportSection;
  if (!section || typeof values?.line !== "string" || !section.label && section.kind !== "unclassified") return values;
  const keys: Record<typeof section.kind, TranslationKey> = {
    branch: "nearbyStations.neighborhoodScore.transportSections.branch",
    shared: "nearbyStations.neighborhoodScore.transportSections.shared",
    junction: "nearbyStations.neighborhoodScore.transportSections.junction",
    unclassified: "nearbyStations.neighborhoodScore.transportSections.unclassified",
  };
  return { ...values, line: `${values.line} — ${t(keys[section.kind], { label: section.label ?? "" })}` };
}
