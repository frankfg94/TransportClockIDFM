import type { TranslationKey, TranslationParams } from "../../../i18n";
import type { NearbyJourney } from "../nearbyHeavyTransports";
import { directNearbyJourneySection, hasEstimatedNearbyJourney } from "../nearbyJourneyTiming";
import type { NeighborhoodFact } from "./contracts";

const MARKET_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const MARKET_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CINEMA_SIZES = ["small", "medium", "large"] as const;

export function directVenueTransitValues(journey: NearbyJourney) {
  const section = directNearbyJourneySection(journey);
  return {
    transitMinutes: Math.floor(journey.durationSeconds / 60),
    transitSeconds: Math.floor(journey.durationSeconds % 60).toString().padStart(2, "0"),
    transitLine: section?.lineCode || section?.lineAliases?.[0] || section?.lineId || "",
    transitEstimated: hasEstimatedNearbyJourney(journey) ? 1 : 0,
  };
}

export function foodMarketSchedule(hours: string, t: (key: TranslationKey) => string, formatMonth: (month: number) => string) {
  const days = new Map<string, { period: string; time: string }[]>();
  const other: string[] = [];
  for (const part of hours.split(/\s*[;·]\s*/u).filter(Boolean)) {
    const row = /^(?:([A-Z][a-z]{2})-([A-Z][a-z]{2})\s+)?((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*)(?:\s+(.+))?$/u.exec(part.trim());
    const [, first, last, rawDays, rawTime] = row ?? [];
    const start = MARKET_MONTHS.indexOf(first ?? "");
    const end = MARKET_MONTHS.indexOf(last ?? "");
    if (!rawDays || (first && (start < 0 || end < 0))) {
      other.push(part);
      continue;
    }
    const period = first ? `${formatMonth(start)}–${formatMonth(end)}` : "";
    const time = (rawTime ?? "—").replace(/(\d{2}:\d{2})\s*[-–]\s*(?=\d{2}:\d{2})/gu, "$1–");
    for (const token of rawDays.split(/\s*,\s*/u)) {
      const [from, to = from] = token.split(/\s*-\s*/u);
      const firstDay = MARKET_DAYS.findIndex(day => day === from);
      const lastDay = MARKET_DAYS.findIndex(day => day === to);
      if (firstDay < 0 || lastDay < 0) continue;
      const count = (lastDay - firstDay + MARKET_DAYS.length) % MARKET_DAYS.length + 1;
      for (let offset = 0; offset < count; offset++) {
        const day = MARKET_DAYS[(firstDay + offset) % MARKET_DAYS.length]!;
        const slots = days.get(day) ?? [];
        if (!slots.some(slot => slot.period === period && slot.time === time)) slots.push({ period, time });
        days.set(day, slots);
      }
    }
  }
  const rows = MARKET_DAYS.flatMap(day => {
    const slots = days.get(day);
    return slots ? [{ day, label: t(`nearbyStations.neighborhoodScore.venueAnalysis.weekdays.${day}`), slots }] : [];
  });
  return { rows, other };
}

/** Shared by the summary and the detailed card, including tooltips. */
export function transportSectionValues(
  fact: NeighborhoodFact,
  values: TranslationParams | undefined,
  t: (key: TranslationKey, values?: TranslationParams) => string,
): TranslationParams | undefined {
  if (values && (fact.family === "food-market" || fact.family === "cinema")) {
    const transit = typeof values.transitMinutes === "number" ? t("nearbyStations.neighborhoodScore.venueAnalysis.directVenueTransit", {
      minutes: values.transitMinutes,
      seconds: values.transitSeconds,
      line: values.transitLine || t("nearbyStations.neighborhoodScore.miniTravel.transport"),
      approx: values.transitEstimated ? "≈" : "",
    }) : "";
    if (fact.family === "cinema") {
      const size = CINEMA_SIZES.find(item => item === values.size);
      const cinemaArea = size && typeof values.area === "number"
        ? t(`nearbyStations.neighborhoodScore.venueAnalysis.cinemaArea.${size}`) : "";
      const walkPrefix = typeof values.walkMinutes === "number"
        ? t("nearbyStations.neighborhoodScore.venueAnalysis.cinemaWalkPrefix", { minutes: values.walkMinutes }) : "";
      return { ...values, transit, walkPrefix, sizeSuffix: cinemaArea ? ` · ${cinemaArea}` : "" };
    }
    const sizes = ["unknown", "small", "medium", "large", "exceptional"] as const;
    const size = sizes.find(item => item === values.size);
    const days = MARKET_DAYS;
    const localizedHours = typeof values.hours === "string" ? values.hours.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/gu, token => {
      const day = days.find(item => item === token);
      return day ? t(`nearbyStations.neighborhoodScore.venueAnalysis.weekdays.${day}`) : token;
    }) : values.hours;
    const area = typeof values.area === "number"
      ? t(values.areaFromFootprint ? "nearbyStations.neighborhoodScore.venueAnalysis.marketFootprintArea"
        : "nearbyStations.neighborhoodScore.venueAnalysis.marketArea", { area: values.area })
      : values.area ?? "—";
    if (size) return { ...values, area, hours: localizedHours ?? "—", size: t(`nearbyStations.neighborhoodScore.venueAnalysis.marketSize.${size}`),
      transit, transitSuffix: transit ? ` · ${transit}` : "" };
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
