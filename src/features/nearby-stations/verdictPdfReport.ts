import { translate, type AppLocale, type TranslationKey } from "../../i18n";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { NeighborhoodFact, NeighborhoodScoreResult } from "./neighborhood/contracts";
import { transportSectionValues } from "./neighborhood/factPresentation";
import { aggregateComparisonScopeTransport, aggregateComparisonTransport, perSquareKilometer } from "./neighborhood-comparison/aggregate";
import type { ComparisonNeighborhood, VerdictScopeData } from "./neighborhood-comparison/types";
import type { NeighborhoodScorePdfSection } from "./neighborhoodScorePdf";
import type { GreenPoint } from "../../../shared/natureInCity";
import { collectVerdictGreenReferences, createVerdictPdfMapContext, type VerdictPdfMapContext, type VerdictPdfMapKind } from "./verdictPdfMaps";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import { GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MAX_DISTANCE_M } from "../transport-map/search/globalMapSearch";
import { cityCommercePointsWithinRadius, type CityCommerceSnapshot } from "./cityCommerceSnapshot";

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
  | { kind: "contents"; entries: { title: string; page: number }[]; contentsPage: number; contentsPageCount: number }
  | { kind: "overview"; score: string; band?: string; coverage: string; groups: VerdictPdfGroup[] }
  | { kind: "city"; city?: string; metrics: VerdictPdfMetric[] }
  | { kind: "category"; score: string; groups: VerdictPdfGroup[]; warning?: string; empty?: string }
  | { kind: "annex"; subtitle?: string; groups: VerdictPdfGroup[] }
  | { kind: "map"; mapType: VerdictPdfMapKind; transitGroup?: "bus" | "night" | "rail"; subtitle: string; separateLegend?: boolean; localCommerceFocus?: boolean }
  | { kind: "legend"; mapType: VerdictPdfMapKind; transitGroup?: "bus"; legendFor: "commerce" | "bus"; subtitle: string; localCommerceFocus?: boolean; commerceLegendOffset?: number; commerceLegendPage?: number; commerceLegendPageCount?: number }
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
  mapContext: VerdictPdfMapContext;
  options: VerdictPdfOptions;
}

export interface VerdictPdfOptions {
  sections: {
    contents: boolean;
    overview: boolean;
    city: boolean;
    commerceMap: boolean;
    /** Add the full commune map after a nearby map when density triggers local focus. */
    commerceCitywideMap: boolean;
    cityTransitMap: boolean;
    localRailMap: boolean;
    localBusMap: boolean;
    localNightMap: boolean;
    greeneryMap: boolean;
    noiseMap: boolean;
    categories: boolean;
    annexes: boolean;
    comparison: boolean;
    sources: boolean;
    closing: boolean;
    commerceLegend: boolean;
    transitLegend: boolean;
  };
  maps: {
    commerceFocusMode: "auto" | "commune";
    commerceFocusRadiusMeters: number;
    commerceFocusPointThreshold: number;
    commerceLegendSeparatePageAtTypeCount: number;
    commerceLegendCategoriesPerPage: number;
    commerceMaxZoom: number;
    commerceClusterCellPx: number;
    commerceClusterDenseCellPx: number;
    commerceClusterVeryDenseCellPx: number;
    commerceClusterDensePointThreshold: number;
    commerceClusterVeryDensePointThreshold: number;
  };
  transit: {
    busNearbyRadiusMeters: number;
    separateBusLegendAtLines: number;
    stationGroupingDistanceMeters: number;
    stationCalloutLimit: number;
  };
  layout: {
    contentsEntriesPerPage: number;
  };
}

export type VerdictPdfOptionsOverrides = {
  [K in keyof VerdictPdfOptions]?: Partial<VerdictPdfOptions[K]>;
};

export const DEFAULT_VERDICT_PDF_OPTIONS: VerdictPdfOptions = {
  sections: {
    contents: true, overview: true, city: true, commerceMap: true, commerceCitywideMap: true, cityTransitMap: true,
    localRailMap: true, localBusMap: true, localNightMap: true, greeneryMap: true, noiseMap: true,
    categories: true, annexes: true, comparison: true, sources: true, closing: true,
    commerceLegend: true, transitLegend: true,
  },
  maps: {
    commerceFocusMode: "auto", commerceFocusRadiusMeters: 1_200, commerceFocusPointThreshold: 80,
    commerceLegendSeparatePageAtTypeCount: 12, commerceMaxZoom: 15.5,
    commerceLegendCategoriesPerPage: 48,
    commerceClusterCellPx: 48, commerceClusterDenseCellPx: 62, commerceClusterVeryDenseCellPx: 80,
    commerceClusterDensePointThreshold: 120, commerceClusterVeryDensePointThreshold: 500,
  },
  transit: {
    busNearbyRadiusMeters: 1_000, separateBusLegendAtLines: 8,
    stationGroupingDistanceMeters: GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MAX_DISTANCE_M,
    stationCalloutLimit: 8,
  },
  layout: {
    contentsEntriesPerPage: 15,
  },
};

export function resolveVerdictPdfOptions(overrides: VerdictPdfOptionsOverrides = {}): VerdictPdfOptions {
  return {
    sections: { ...DEFAULT_VERDICT_PDF_OPTIONS.sections, ...overrides.sections },
    maps: { ...DEFAULT_VERDICT_PDF_OPTIONS.maps, ...overrides.maps },
    transit: { ...DEFAULT_VERDICT_PDF_OPTIONS.transit, ...overrides.transit },
    layout: { ...DEFAULT_VERDICT_PDF_OPTIONS.layout, ...overrides.layout },
  };
}

/** Apply the same commerce snapshot to the nearby and citywide PDF views. */
export function withVerdictPdfCommerceMaps(
  report: VerdictPdfReport,
  commerce: VerdictPdfMapContext["commerce"],
  origin?: GreenPoint,
): VerdictPdfReport {
  const snapshot = commerce?.snapshot as CityCommerceSnapshot | undefined;
  const options = report.options;
  const nearby = snapshot && origin
    ? cityCommercePointsWithinRadius(snapshot, origin, options.maps.commerceFocusRadiusMeters)
    : [];
  const localCommerceFocus = options.maps.commerceFocusMode === "auto"
    && nearby.length >= options.maps.commerceFocusPointThreshold;
  const localTypeCount = new Set(nearby.map(point => `${point.typeKey}:${point.iconId}`)).size;
  const cityTypeCount = snapshot?.categories.length ?? 0;
  const separateLocalLegend = options.sections.commerceLegend
    && localTypeCount >= options.maps.commerceLegendSeparatePageAtTypeCount;
  const separateCityLegend = options.sections.commerceLegend
    && cityTypeCount >= options.maps.commerceLegendSeparatePageAtTypeCount;
  const pages = report.pages.map((page): VerdictPdfPage => {
    if (page.kind !== "map" || page.id !== "commune-commerce-map") return page;
    return {
      ...page,
      title: localCommerceFocus ? pdfLabel(report.locale, "commerceNearbyMap") : page.title,
      subtitle: localCommerceFocus ? pdfLabel(report.locale, "commerceNearbyMapDescription") : page.subtitle,
      localCommerceFocus,
      separateLegend: localCommerceFocus ? separateLocalLegend : separateCityLegend,
    };
  });
  const mapIndex = pages.findIndex(page => page.kind === "map" && page.id === "commune-commerce-map");
  if (mapIndex < 0) return withVerdictPdfContents(commerce
    ? { ...report, mapContext: { ...report.mapContext, commerce } }
    : report);

  const legendPages = (idPrefix: string, localFocus: boolean, typeCount: number): VerdictPdfPage[] => {
    const pageSize = Math.max(1, options.maps.commerceLegendCategoriesPerPage);
    const count = Math.max(1, Math.ceil(typeCount / pageSize));
    const entriesPerPage = Math.max(1, Math.ceil(typeCount / count));
    return Array.from({ length: count }, (_, index) => ({
      id: count === 1 ? idPrefix : `${idPrefix}-${index + 1}`,
      kind: "legend" as const,
      mapType: "commerce" as const,
      legendFor: "commerce" as const,
      title: count === 1 ? pdfLabel(report.locale, "commerceLegend")
        : pdfLabel(report.locale, "commerceLegendPageTitle", { page: index + 1, total: count }),
      subtitle: pdfLabel(report.locale, "commerceLegendDescription"),
      localCommerceFocus: localFocus,
      commerceLegendOffset: index * entriesPerPage,
      commerceLegendPage: index + 1,
      commerceLegendPageCount: count,
    }));
  };
  const additions: VerdictPdfPage[] = [];
  if (localCommerceFocus && separateLocalLegend) additions.push(...legendPages("nearby-commerce-legend", true, localTypeCount));
  if (localCommerceFocus && options.sections.commerceCitywideMap) {
    additions.push({
      id: "commune-commerce-map-overview", kind: "map", mapType: "commerce",
      title: pdfLabel(report.locale, "commerceMap"), subtitle: pdfLabel(report.locale, "commerceMapDescription"),
      localCommerceFocus: false, separateLegend: separateCityLegend,
    });
    if (separateCityLegend) additions.push(...legendPages("commune-commerce-legend-overview", false, cityTypeCount));
  } else if (!localCommerceFocus && separateCityLegend) additions.push(...legendPages("commune-commerce-legend", false, cityTypeCount));
  pages.splice(mapIndex + 1, 0, ...additions);
  return withVerdictPdfContents({
    ...report,
    mapContext: commerce ? { ...report.mapContext, commerce } : report.mapContext,
    pages,
  });
}

/** Rebuild the table of contents after optional map and legend pages are added. */
export function withVerdictPdfContents(report: VerdictPdfReport): VerdictPdfReport {
  const contentPages = report.pages.filter(page => page.kind !== "contents");
  if (!report.options.sections.contents) return { ...report, pages: contentPages };

  const entriesPerPage = Math.max(1, Math.floor(report.options.layout.contentsEntriesPerPage));
  const contentsPageCount = Math.max(1, Math.ceil(contentPages.length / entriesPerPage));
  const contentsPages: VerdictPdfPage[] = Array.from({ length: contentsPageCount }, (_, index) => ({
    id: contentsPageCount === 1 ? "contents" : `contents-${index + 1}`,
    kind: "contents",
    title: contentsPageCount === 1
      ? pdfLabel(report.locale, "contents")
      : pdfLabel(report.locale, "contentsPage", { page: index + 1, total: contentsPageCount }),
    contentsPage: index + 1,
    contentsPageCount,
    entries: contentPages.slice(index * entriesPerPage, (index + 1) * entriesPerPage)
      .map((page, pageIndex) => ({ title: page.title, page: contentsPageCount + index * entriesPerPage + pageIndex + 1 })),
  }));
  return { ...report, pages: [...contentsPages, ...contentPages] };
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
  options?: VerdictPdfOptionsOverrides;
}): VerdictPdfReport {
  const { locale, result } = input;
  const options = resolveVerdictPdfOptions(input.options);
  const t = (key: TranslationKey, params?: Parameters<typeof translate>[2]) => translate(locale, key, params);
  const p = (key: PdfLabel) => pdfLabel(locale, key);
  const busRadius = pdfNumber(locale, options.transit.busNearbyRadiusMeters / 1_000);
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
  const educationTypeTitles: Record<string, TranslationKey> = {
    elementary: "nearbyStations.neighborhoodScore.education.types.elementary",
    maternelle: "nearbyStations.neighborhoodScore.education.types.maternelle",
    nursery: "nearbyStations.neighborhoodScore.education.types.nursery",
    college: "nearbyStations.neighborhoodScore.education.types.college",
    "high-school": "nearbyStations.neighborhoodScore.education.types.highSchool",
    other: "nearbyStations.neighborhoodScore.education.types.other",
  };
  const educationGroups = (category: NeighborhoodScoreResult["categories"][number]): VerdictPdfGroup[] => {
    const buckets = new Map<string, { tone: VerdictPdfGroup["tone"]; items: string[] }>();
    const ungrouped = { positiveFacts: [] as NeighborhoodFact[], negativeFacts: [] as NeighborhoodFact[], neutralFacts: [] as NeighborhoodFact[] };
    for (const [tone, facts] of [
      ["positive", category.positiveFacts], ["negative", category.negativeFacts], ["neutral", category.neutralFacts],
    ] as const) for (const fact of facts) {
      const type = fact.family?.startsWith("education:") ? fact.family.slice("education:".length) : undefined;
      const titleKey = type ? educationTypeTitles[type] : undefined;
      if (!type || !titleKey) {
        ungrouped[`${tone}Facts`].push(fact);
        continue;
      }
      const current = buckets.get(type) ?? { tone, items: [] };
      current.items.push(...factItems([fact]));
      buckets.set(type, current);
    }
    const order = ["elementary", "maternelle", "nursery", "college", "high-school", "other"];
    return [
      ...order.flatMap(type => {
        const bucket = buckets.get(type);
        const titleKey = educationTypeTitles[type];
        return bucket && titleKey ? [{ title: t(titleKey), tone: bucket.tone, items: bucket.items }] : [];
      }),
      ...factGroups(ungrouped).filter(group => group.items.length),
    ];
  };
  const groups = factGroups(result).slice(0, 2);
  const categories = result.categories.map((category): VerdictPdfPage => ({
    id: category.id,
    kind: "category",
    title: t(category.labelKey),
    score: score(category.available ? category.displayScore : undefined),
    groups: (category.id === "education" ? educationGroups(category) : factGroups(category)).filter(group => group.items.length),
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
      ...(options.sections.contents ? [{ id: "contents", kind: "contents" as const, title: p("contents"),
        entries: [], contentsPage: 1, contentsPageCount: 1 }] : []),
      ...(options.sections.overview ? [{ id: "overview", kind: "overview" as const, title: p("overview"), score: score(result.displayScore),
        band: result.band ? t(bandKeys[result.band]) : undefined, groups,
        coverage: t("nearbyStations.neighborhoodScore.coverage", { available: result.availableCategoryCount, total: result.totalCategoryCount }) }] : []),
      ...(options.sections.city ? [{ id: "city", kind: "city" as const, title: p("city"), city: input.city, metrics: [] }] : []),
      ...(options.sections.commerceMap ? [{ id: "commune-commerce-map", kind: "map" as const, mapType: "commerce" as const, title: p("commerceMap"), subtitle: p("commerceMapDescription") }] : []),
      ...(options.sections.cityTransitMap ? [{ id: "city-transit-rail-map", kind: "map" as const, mapType: "city-transit" as const, transitGroup: "rail" as const, title: `${p("cityTransportMap")} · ${translate(input.locale, "nearbyStations.neighborhoodScore.pdfReport.railMapSuffix")}`, subtitle: p("cityTransportMapDescription") }] : []),
      ...(options.sections.localRailMap ? [{ id: "neighborhood-transit-rail-map", kind: "map" as const, mapType: "neighborhood-transit" as const, transitGroup: "rail" as const, title: `${p("neighborhoodTransportMap")} · ${translate(input.locale, "nearbyStations.neighborhoodScore.pdfReport.railMapSuffix")}`, subtitle: p("neighborhoodTransportMapDescription") }] : []),
      ...(options.sections.localBusMap ? [{ id: "neighborhood-transit-bus-map", kind: "map" as const, mapType: "neighborhood-transit" as const, transitGroup: "bus" as const, title: p("localBusMap"), subtitle: pdfLabel(locale, "localBusMapDescription", { radius: busRadius }) }] : []),
      ...(options.sections.localNightMap ? [{ id: "neighborhood-transit-night-map", kind: "map" as const, mapType: "neighborhood-transit" as const, transitGroup: "night" as const, title: p("localNightMap"), subtitle: pdfLabel(locale, "localNightMapDescription", { radius: busRadius }) }] : []),
      ...(options.sections.greeneryMap ? [{ id: "greenery-map", kind: "map" as const, mapType: "greenery" as const, title: p("greeneryMap"), subtitle: p("greeneryMapDescription") }] : []),
      ...(options.sections.noiseMap ? [{ id: "noise-map", kind: "map" as const, mapType: "noise" as const, title: p("noiseMap"), subtitle: p("noiseMapDescription") }] : []),
      ...(options.sections.categories ? categories : []),
      ...(options.sections.annexes ? annexes : []),
      ...(options.sections.comparison ? [{ id: "comparison", kind: "comparison" as const, title: p("comparison"), metrics: [] }] : []),
      ...(options.sections.sources ? [{ id: "sources", kind: "sources" as const, title: p("sources"), groups: [
        { title: p("limits"), tone: "negative" as const, items: limitations },
        { title: p("dataSources"), tone: "neutral" as const, items: sources },
      ] }] : []),
      ...(options.sections.closing ? [{ id: "closing", kind: "closing" as const, title: p("closing"), groups: groups.map(group => ({ ...group, items: group.items.slice(0, 2) })) }] : []),
    ],
    mapContext: createVerdictPdfMapContext({ city: input.city, greenReferences: collectVerdictGreenReferences(result) }),
    options,
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

function countNearbyBusLines(
  network: TransportMapNetwork | undefined,
  transit: VerdictPdfMapContext["transit"] | undefined,
  origin: GreenPoint | undefined,
  radiusMeters: number,
): number {
  if (!network || !origin) return 0;
  const stations = new Map([...network.stations, ...(transit?.["neighborhood-transit"]?.stations ?? [])]
    .map(station => [station.id, station]));
  const lineIds = new Set<string>();
  for (const station of stations.values()) {
    if (getCoordinatesDistanceMeters(origin.lat, origin.lon, station.lat, station.lon) > radiusMeters) continue;
    for (const id of station.lineIds) {
      if (network.linesById.get(id)?.mode === "BUS") lineIds.add(id);
    }
  }
  return lineIds.size;
}

export function withVerdictPdfComparison(
  report: VerdictPdfReport,
  data?: VerdictScopeData,
  network?: TransportMapNetwork,
  origin?: GreenPoint,
  transit?: VerdictPdfMapContext["transit"],
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
  const mapContext = createVerdictPdfMapContext({
    city: geography?.commune.name ?? report.mapContext.city,
    origin,
    areas: neighborhoods,
    selectedCodes: selected ? [selected.codeIris] : (geography?.matchingCodes ?? []),
    greenReferences: report.mapContext.greenReferences,
    network,
    transit,
  });
  let pages = report.pages.map((page): VerdictPdfPage => {
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
  });
  const busLineCount = countNearbyBusLines(network, transit, origin, report.options.transit.busNearbyRadiusMeters);
  const busPageIndex = pages.findIndex(page => page.id === "neighborhood-transit-bus-map" && page.kind === "map");
  if (busPageIndex >= 0 && report.options.sections.transitLegend
    && busLineCount >= report.options.transit.separateBusLegendAtLines) {
    const busPage = pages[busPageIndex]!;
    if (busPage.kind === "map") {
      pages[busPageIndex] = { ...busPage, separateLegend: true };
      pages.splice(busPageIndex + 1, 0, {
        id: "neighborhood-transit-bus-legend", kind: "legend", mapType: "neighborhood-transit",
        transitGroup: "bus", legendFor: "bus", title: p("localBusLegend"), subtitle: p("localBusLegendDescription"),
      });
    }
  }
  return {
    ...report,
    mapContext,
    pages,
  };
}
