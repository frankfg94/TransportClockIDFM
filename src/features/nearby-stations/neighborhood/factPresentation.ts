import type { TranslationKey, TranslationParams } from "../../../i18n";
import type { NeighborhoodFact } from "./contracts";

/** Shared by the summary and the detailed card, including tooltips. */
export function transportSectionValues(
  fact: NeighborhoodFact,
  values: TranslationParams | undefined,
  t: (key: TranslationKey, values?: TranslationParams) => string,
): TranslationParams | undefined {
  if (fact.family === "food-market" && values && typeof values.size === "string") {
    const sizes = ["unknown", "small", "medium", "large", "exceptional"] as const;
    const size = sizes.find(item => item === values.size);
    const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
    const localizedHours = typeof values.hours === "string" ? values.hours.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/gu, token => {
      const day = days.find(item => item === token);
      return day ? t(`nearbyStations.neighborhoodScore.venueAnalysis.weekdays.${day}`) : token;
    }) : values.hours;
    if (size) return { ...values, hours: localizedHours ?? "—", size: t(`nearbyStations.neighborhoodScore.venueAnalysis.marketSize.${size}`) };
  }
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
