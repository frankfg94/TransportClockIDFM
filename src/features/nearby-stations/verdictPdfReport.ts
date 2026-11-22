import { translate, type AppLocale, type TranslationKey } from "../../i18n";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { NeighborhoodFact, NeighborhoodScoreResult } from "./neighborhood/contracts";
import { transportSectionValues } from "./neighborhood/factPresentation";
import { aggregateComparisonScopeTransport, aggregateComparisonTransport, perSquareKilometer } from "./neighborhood-comparison/aggregate";
import type { ComparisonNeighborhood, VerdictScopeData } from "./neighborhood-comparison/types";
import type { NeighborhoodScorePdfSection } from "./neighborhoodScorePdf";

type PdfLabels = Extract<TranslationKey, `nearbyStations.neighborhoodScore.pdfReport.${string}`>;
export type PdfLabel = PdfLabels extends `nearbyStations.neighborhoodScore.pdfReport.${infer Key}` ? Key : never;

export interface VerdictPdfGroup {
  title: string;
  tone: "positive" | "negative" | "neutral";
  items: string[];
}

interface VerdictPdfMetric {
  label: PdfLabel;
  value?: number;
  unit?: "km²" | "ha" | "%" | "/km²";
}

export interface VerdictPdfComparisonMetric extends VerdictPdfMetric {
  median?: number;
  rank?: number;
  count: number;
}

type VerdictPdfContent =
  | { kind: "contents" }
  | { kind: "overview"; score: string; band?: string; coverage: string; groups: VerdictPdfGroup[] }
  | { kind: "city"; city?: string; metrics: VerdictPdfMetric[] }
  | { kind: "category"; score: string; groups: VerdictPdfGroup[]; warning?: string; empty?: string }
  | { kind: "annex"; subtitle?: string; groups: VerdictPdfGroup[] }
  | { kind: "comparison"; neighborhood?: string; city?: string; notice?: TranslationKey; metrics: VerdictPdfComparisonMetric[] }
  | { kind: "sources"; groups: VerdictPdfGroup[] }
  | { kind: "closing"; groups: VerdictPdfGroup[] };

export type VerdictPdfPage = VerdictPdfContent & { id: string; title: string };

export interface VerdictPdfReport {
  locale: AppLocale;
  title: string;
  location?: string;
  updated: string;
  pages: VerdictPdfPage[];
}

export function pdfLabel(locale: AppLocale, key: PdfLabel, params?: Parameters<typeof translate>[2]): string {
  return translate(locale, `nearbyStations.neighborhoodScore.pdfReport.${key}`, params);
}

function cleanText(value: string): string {
  return value.replace(/(?:https?|file|capacitor):\/\/\S+|\bwww\.\S+/gi, "").replace(/\s+/g, " ").trim();
}

function sourceLine(source: { title: string; producer: string; referencePeriod?: string }): string {
  return cleanText([...new Set([source.title, source.producer, source.referencePeriod].filter(Boolean))].join(" · "));
}

export function pdfNumber(locale: AppLocale, value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits }).format(value);
}

function dateLabel(locale: AppLocale, value: string | number, withTime = false): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
        dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}),
      }).format(date)
    : "";
}

const bandKeys = {
  excellent: "nearbyStations.neighborhoodScore.bands.excellent",
  good: "nearbyStations.neighborhoodScore.bands.good",
  medium: "nearbyStations.neighborhoodScore.bands.medium",
  weak: "nearbyStations.neighborhoodScore.bands.weak",
  "very-weak": "nearbyStations.neighborhoodScore.bands.veryWeak",
} as const;

export function buildVerdictPdfReport(input: {
  locale: AppLocale;
  result: NeighborhoodScoreResult;
  location?: string;
  city?: string;
  gtfsWarning?: string;
  partialError?: string;
  annexes: (NeighborhoodScorePdfSection | undefined)[];
}): VerdictPdfReport {
  const { locale, result } = input;
  const t = (key: TranslationKey, params?: Parameters<typeof translate>[2]) => translate(locale, key, params);
  const p = (key: PdfLabel) => pdfLabel(locale, key);
  const score = (value?: number) => typeof value === "number" && Number.isFinite(value)
    ? `${pdfNumber(locale, value)} / 10`
    : t("nearbyStations.neighborhoodScore.pdfScoreUnavailable");
  const factItems = (facts: readonly NeighborhoodFact[]) => facts.map(fact => cleanText(
    fact.label ?? (fact.labelKey ? t(fact.labelKey, transportSectionValues(fact, fact.labelValues, t)) : ""),
  )).filter(Boolean);
  const factGroups = (facts: Pick<NeighborhoodScoreResult, "positiveFacts" | "negativeFacts" | "neutralFacts">): VerdictPdfGroup[] => [
    { tone: "positive", title: t("nearbyStations.neighborhoodScore.positives"), items: factItems(facts.positiveFacts) },
    { tone: "negative", title: t("nearbyStations.neighborhoodScore.negatives"), items: factItems(facts.negativeFacts) },
    { tone: "neutral", title: t("nearbyStations.neighborhoodScore.neutralFacts"), items: factItems(facts.neutralFacts) },
  ];
  const groups = factGroups(result).slice(0, 2);
  const categories = result.categories.map((category): VerdictPdfPage => ({
    id: category.id,
    kind: "category",
    title: t(category.labelKey),
    score: score(category.available ? category.displayScore : undefined),
    groups: factGroups(category).filter(group => group.items.length),
    warning: category.id === "transport" ? input.gtfsWarning : undefined,
    empty: !category.available
      ? t(category.unavailableReasonKey ?? "nearbyStations.neighborhoodScore.noData")
      : undefined,
  }));
  const annexes = input.annexes.flatMap((section, index): VerdictPdfPage[] => section ? [{
    id: `annex-${index}`, kind: "annex", title: section.title,
    subtitle: section.subtitle ? cleanText(section.subtitle) : undefined,
    groups: [{ title: p("findings"), tone: "neutral", items: section.items.map(cleanText).filter(Boolean) }],
  }] : []);
  const date = dateLabel(locale, result.generatedAt, true);
  const unavailable = categories.filter((_, index) => !result.categories[index]?.available).map(page => page.title);
  const limitations = [p("addressScope"), p("inventoryScope"),
    ...(unavailable.length ? [pdfLabel(locale, "missingCategories", { categories: unavailable.join(", ") })] : []),
    ...(input.gtfsWarning ? [input.gtfsWarning] : []),
    ...(input.partialError ? [input.partialError] : []),
  ];
  const sources = result.sources.map(source => sourceLine(source));
  const stale = result.sources.filter(source => source.freshness.status === "stale").map(source => source.title);
  if (stale.length) limitations.push(pdfLabel(locale, "staleSources", { sources: stale.join(", ") }));
  return {
    locale,
    title: t("nearbyStations.neighborhoodScore.pageTitle"),
    location: input.location ? cleanText(input.location) : undefined,
    updated: date ? t("nearbyStations.neighborhoodScore.updatedAt", { time: date }) : "",
    pages: [
      { id: "contents", kind: "contents", title: p("contents") },
      { id: "overview", kind: "overview", title: p("overview"), score: score(result.displayScore),
        band: result.band ? t(bandKeys[result.band]) : undefined, groups,
        coverage: t("nearbyStations.neighborhoodScore.coverage", { available: result.availableCategoryCount, total: result.totalCategoryCount }) },
      { id: "city", kind: "city", title: p("city"), city: input.city, metrics: [] },
      ...categories,
      ...annexes,
      { id: "comparison", kind: "comparison", title: p("comparison"), metrics: [] },
      { id: "sources", kind: "sources", title: p("sources"), groups: [
        { title: p("limits"), tone: "negative", items: limitations },
        { title: p("dataSources"), tone: "neutral", items: sources },
      ] },
      { id: "closing", kind: "closing", title: p("closing"), groups: groups.map(group => ({ ...group, items: group.items.slice(0, 2) })) },
    ],
  };
}

export function compareVerdictMetric(value: number | undefined, peers: readonly (number | undefined)[]) {
  const measuredValue = value !== undefined && Number.isFinite(value) ? value : undefined;
  const sorted = peers.filter((peer): peer is number => typeof peer === "number" && Number.isFinite(peer)).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length ? (sorted[middle]! + sorted[Math.floor((sorted.length - 1) / 2)]!) / 2 : undefined;
  return {
    value: measuredValue, median,
    rank: measuredValue === undefined || !sorted.length ? undefined : 1 + sorted.filter(peer => peer > measuredValue).length,
    count: sorted.length + (measuredValue === undefined ? 0 : 1),
  };
}

export function withVerdictPdfComparison(
  report: VerdictPdfReport,
  data?: VerdictScopeData,
  network?: TransportMapNetwork,
): VerdictPdfReport {
  const geography = data?.geography;
  const neighborhoods = geography?.neighborhoods ?? [];
  const selected = neighborhoods.find(item => item.codeIris === geography?.selectedCode);
  const peers = neighborhoods.filter(item => item !== selected);
  const inventory = data?.places?.counts;
  const greenRows = neighborhoods.map(item => data?.green?.[item.codeIris]);
  const hasRegionalParks = (row: typeof greenRows[number]) => row?.publicParkAreaM2 !== undefined;
  const hasLocalParks = (row: typeof greenRows[number]) => row?.areaM2 !== undefined && !row.error;
  const useRegionalParks = greenRows.some(hasRegionalParks)
    && (greenRows.every(hasRegionalParks) || !greenRows.every(hasLocalParks));
  const parkArea = (item: ComparisonNeighborhood) => {
    const row = data?.green?.[item.codeIris];
    return useRegionalParks ? row?.publicParkAreaM2 : (hasLocalParks(row) ? row?.areaM2 : undefined);
  };
  const parkAreas = neighborhoods.map(parkArea);
  const parks = parkAreas.length && parkAreas.every(area => area !== undefined)
    ? parkAreas.reduce((total, area) => total + area, 0) : undefined;
  const cityStations = network && neighborhoods.length ? aggregateComparisonScopeTransport(neighborhoods, network).stationCount : undefined;
  const stations = network && selected && peers.length ? aggregateComparisonTransport(neighborhoods, network) : undefined;
  const cityMetrics: VerdictPdfMetric[] = [
    { label: "area", value: neighborhoods.length ? neighborhoods.reduce((total, item) => total + item.areaM2, 0) / 1_000_000 : undefined, unit: "km²" },
    { label: "areas", value: neighborhoods.length || undefined },
    { label: "shops", value: inventory ? Object.values(inventory).reduce((total, counts) => total + counts.commerce, 0) : undefined },
    { label: "businesses", value: inventory ? Object.values(inventory).reduce((total, counts) => total + counts.economic, 0) : undefined },
    { label: "stations", value: cityStations },
    { label: "parks", value: parks === undefined ? undefined : parks / 10_000, unit: "ha" },
  ];
  const comparisonNotice: TranslationKey | undefined = data?.boundary || (geography && !selected)
    ? "nearbyStations.comparison.scopeBoundary"
    : !geography ? "nearbyStations.comparison.unavailable"
    : !peers.length ? "nearbyStations.comparison.scopeNoRest"
    : undefined;
  const density = (count: number | undefined, item: ComparisonNeighborhood) =>
    count === undefined ? undefined : perSquareKilometer(count, item.areaM2);
  const measures: { label: PdfLabel; unit: VerdictPdfMetric["unit"]; measure: (item: ComparisonNeighborhood) => number | undefined }[] = [
    { label: "shops", unit: "/km²", measure: item => density(inventory?.[item.codeIris]?.commerce, item) },
    { label: "businesses", unit: "/km²", measure: item => density(inventory?.[item.codeIris]?.economic, item) },
    { label: "parks", unit: "%", measure: item => {
      const area = parkArea(item);
      return area === undefined || item.areaM2 <= 0 ? undefined : 100 * area / item.areaM2;
    } },
    { label: "stations", unit: "/km²", measure: item => density(stations?.get(item.id)?.stationCount, item) },
  ];
  const comparisonMetrics: VerdictPdfComparisonMetric[] = !selected || !peers.length ? []
    : measures.map(({ label, unit, measure }) => ({ label, unit, ...compareVerdictMetric(measure(selected), peers.map(measure)) }));
  const p = (key: PdfLabel) => pdfLabel(report.locale, key);
  const comparisonSources = [
    ...(geography ? [sourceLine(geography.irisSource)] : []),
    ...(inventory ? [[p("placesSource"), data?.placesDate ? dateLabel(report.locale, data.placesDate) : ""].filter(Boolean).join(" · ")] : []),
    ...(useRegionalParks ? [p("parksSource")]
      : greenRows.some(hasLocalParks) && geography?.greenSource ? [sourceLine(geography.greenSource)] : []),
    ...(cityStations !== undefined ? [p("transportSource")] : []),
  ];
  const missing = cityMetrics.filter(metric => metric.value === undefined).map(metric => p(metric.label));
  return {
    ...report,
    pages: report.pages.map((page): VerdictPdfPage => {
      if (page.kind === "city") return { ...page, city: geography?.commune.name ?? page.city, metrics: cityMetrics };
      if (page.kind === "comparison") return { ...page, city: geography?.commune.name, neighborhood: selected?.name, notice: comparisonNotice, metrics: comparisonMetrics };
      if (page.kind !== "sources") return page;
      return { ...page, groups: page.groups.map(group => ({
        ...group,
        items: group.tone === "neutral"
          ? [...new Set([...comparisonSources, ...group.items])]
          : [...group.items, ...(missing.length ? [pdfLabel(report.locale, "missingCityMetrics", { metrics: missing.join(", ") })] : []),
            ...(comparisonNotice ? [translate(report.locale, comparisonNotice)] : comparisonMetrics.some(metric => metric.count < neighborhoods.length)
              ? [p("partialComparison")] : [])],
      })) };
    }),
  };
}
