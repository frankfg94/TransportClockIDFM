<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ChevronRight, Search, Train, XIcon } from "lucide-vue-next";
import LineIconBadge from "../../../components/LineIconBadge.vue";
import { createLinePresentation, transitFamilyToMode } from "../../../services/linePresentation";
import type { TransitFamily } from "../../../types/transit";
import type { GeocoderPoint } from "../contracts/geocoder";
import type {
  GlobalMapEntrance,
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapStation,
} from "../contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import {
  createGlobalMapSearchIndex,
  modeRank,
  normalizeGlobalMapSearchText,
  searchGlobalMapIndex,
  type GlobalMapStationSearchGroup,
} from "./globalMapSearch";
import { useI18n } from "../../../i18n";
import { resolveGlobalMapMarkerIcon } from "../../line-map/globalMapMarkerIcons";
import type { GlobalMapMarker } from "../../line-map/globalMapMarkers";
import { useNearbyPlacePresenter } from "../../nearby-stations/useNearbyPlacePresenter";

interface RecentSearchKey {
  kind: "station" | "line";
  id: string;
}

type SearchResult =
  | {
      kind: "station";
      key: string;
      station: GlobalMapStationSearchGroup;
      lines: GlobalMapLine[];
      railLines: GlobalMapLine[];
      busLines: GlobalMapLine[];
      entranceCount: number;
    }
  | {
      kind: "line";
      key: string;
      line: GlobalMapLine;
      stationCount: number;
    }
  | {
      kind: "place";
      key: string;
      place: GeocoderPoint;
    }
  | {
      kind: "marker";
      key: string;
      marker: GlobalMapMarker;
    };

interface SearchSection {
  id: string;
  label: string;
  results: SearchResult[];
}

const RECENT_STORAGE_KEY = "transport-clock.global-map-search.recent.v1";
const MAX_RECENT_SEARCHES = 8;
const MAX_PLACE_SEARCH_CACHE_ENTRIES = 32;
const MIN_PLACE_SEARCH_QUERY_LENGTH = 3;

const props = withDefaults(defineProps<{
  open?: boolean;
  lines: GlobalMapLine[];
  stations: GlobalMapStation[];
  entrances?: GlobalMapEntrance[];
  catalogReady?: boolean;
  catalogLoading?: boolean;
  searchPlaces?: (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;
  markers?: readonly GlobalMapMarker[];
}>(), {
  open: false,
  lines: () => [],
  stations: () => [],
  entrances: () => [],
  catalogReady: true,
  catalogLoading: false,
  markers: () => [],
});

const emit = defineEmits<{
  "update:open": [open: boolean];
  open: [];
  close: [];
  "request-catalog": [];
  "select-station": [station: GlobalMapStationSearchGroup];
  "select-line": [line: GlobalMapLine];
  "select-place": [place: GeocoderPoint];
  "select-marker": [marker: GlobalMapMarker];
}>();

const { t } = useI18n();
const searchInput = ref<HTMLInputElement>();
const query = ref("");
const localQuery = ref("");
const placeResults = ref<GeocoderPoint[]>([]);
const placeSearchLoading = ref(false);
const placeSearchError = ref(false);
const activeIndex = ref(-1);
const recentSearches = ref<RecentSearchKey[]>(readRecentSearches());
const expandedStationKeys = ref(new Set<string>());
const hoverTimers = new Map<string, number>();
const placeSearchCache = new Map<string, GeocoderPoint[]>();
let localSearchFrame: number | undefined;
let placeSearchTimer: number | undefined;
let placeSearchController: AbortController | undefined;
let searchVersion = 0;
const { presentPlace } = useNearbyPlacePresenter();

onBeforeUnmount(() => {
  cancelScheduledSearch();
  cancelPlaceSearch();
  if (typeof window !== "undefined") {
    for (const timer of hoverTimers.values()) window.clearTimeout(timer);
  }
  hoverTimers.clear();
});

const searchOptions = {
  stationLimit: GLOBAL_TRANSPORT_PLAN_CONFIG.search.stationLimit,
  lineLimit: GLOBAL_TRANSPORT_PLAN_CONFIG.search.lineLimit,
  sameNameMergeMaxDistanceM: GLOBAL_TRANSPORT_PLAN_CONFIG.search.sameNameMergeMaxDistanceM,
  sameNameMergeMinHeavyLines: GLOBAL_TRANSPORT_PLAN_CONFIG.search.sameNameMergeMinHeavyLines,
};
const stationNameCollator = new Intl.Collator("fr-FR", { sensitivity: "base" });
const searchIndex = computed(() => createGlobalMapSearchIndex(props.stations, props.lines, searchOptions));
const normalizedQuery = computed(() => normalizeGlobalMapSearchText(localQuery.value));
const linesById = computed(() => new Map(props.lines.map((line) => [line.id, line])));
const groupedStations = computed(() => searchIndex.value.groups);
const groupedStationByMemberId = computed(() => searchIndex.value.groupsByMemberId);
const entrancesByStationId = computed(() => {
  const counts = new Map<string, number>();
  for (const entrance of props.entrances) {
    counts.set(entrance.stationId, (counts.get(entrance.stationId) ?? 0) + 1);
  }
  return counts;
});

const matchingResults = computed(() => searchGlobalMapIndex(searchIndex.value, normalizedQuery.value));

const matchingPlaces = computed(() => placeResults.value.map((place, index): SearchResult => ({
  kind: "place",
  key: `match-place-${index}-${placeResultKey(place)}`,
  place,
})));
const matchingMarkers = computed(() => props.markers
  .filter((marker) => !marker.isHidden)
  .filter((marker) => {
    const searchable = normalizeGlobalMapSearchText(`${marker.name} ${marker.address ?? ""}`);
    return !normalizedQuery.value || searchable.includes(normalizedQuery.value);
  })
  .map((marker): SearchResult => ({
    kind: "marker",
    key: `match-marker-${marker.id}`,
    marker,
  })));

const recentResults = computed(() => recentSearches.value
  .map((entry, index) => {
    if (entry.kind === "station") {
      const station = groupedStationByMemberId.value.get(entry.id);
      return station ? createStationResult(station, `recent-${index}`) : undefined;
    }
    const line = linesById.value.get(entry.id);
    return line ? createLineResult(line, `recent-${index}`) : undefined;
  })
  .filter((result): result is SearchResult => Boolean(result)));

const correspondenceResults = computed(() => groupedStations.value
  .filter((station) => station.lineIds.length > 1)
  .sort((left, right) => right.lineIds.length - left.lineIds.length || Number(right.isHub) - Number(left.isHub) || stationNameCollator.compare(left.name, right.name))
  .slice(0, 4)
  .map((station, index) => createStationResult({ ...station, memberStationIds: [station.id] }, `correspondence-${index}`)));

const sections = computed<SearchSection[]>(() => {
  // The visibleResults watcher stays mounted while the panel is closed.
  // Do not let catalogue hydration at zoom 11 pull the full search index and
  // correspondence sort into the map's update. Read no catalogue deps here.
  if (!props.open) return [];

  if (normalizedQuery.value) {
    return [
      { id: "stations", label: t("globalMap.search.stations"), results: matchingResults.value.stations.map((station, index) => createStationResult(station, `match-station-${index}`)) },
      { id: "lines", label: t("globalMap.search.lines"), results: matchingResults.value.lines.map((line, index) => createLineResult(line, `match-line-${index}`)) },
      { id: "places", label: t("globalMap.search.places"), results: matchingPlaces.value },
      { id: "markers", label: t("globalMap.search.markers"), results: matchingMarkers.value },
    ].filter((section) => section.results.length > 0);
  }

  return [
    { id: "recent", label: t("globalMap.search.recent"), results: recentResults.value },
    { id: "correspondences", label: t("globalMap.search.correspondences"), results: correspondenceResults.value },
  ].filter((section) => section.results.length > 0);
});

const visibleResults = computed(() => sections.value.flatMap((section) => section.results));
const activeResultKey = computed(() => visibleResults.value[activeIndex.value]?.key);
const isLoading = computed(() => props.catalogLoading && visibleResults.value.length === 0);
const noResults = computed(() => Boolean(normalizedQuery.value) && visibleResults.value.length === 0 && !props.catalogLoading && !placeSearchLoading.value && !placeSearchError.value);
const catalogHint = computed(() => !props.catalogReady && !props.catalogLoading && props.stations.length === 0);

watch(visibleResults, (results) => {
  if (activeIndex.value >= results.length) activeIndex.value = results.length - 1;
});

function createStationResult(station: GlobalMapStationSearchGroup, prefix: string): SearchResult {
  const lines = station.lineIds
    .map((lineId) => linesById.value.get(lineId))
    .filter((line): line is GlobalMapLine => Boolean(line))
    .sort((left, right) => modeRank(left.mode) - modeRank(right.mode) || left.code.localeCompare(right.code, "fr-FR", { numeric: true }));
  const railLines = lines.filter((line) => line.mode !== "BUS" && line.mode !== "NOCTILIEN");
  const busLines = lines.filter((line) => line.mode === "BUS" || line.mode === "NOCTILIEN");
  const entranceCount = station.memberStationIds.reduce((total, stationId) => total + (entrancesByStationId.value.get(stationId) ?? 0), 0);
  return {
    kind: "station",
    key: `${prefix}:station:${station.id}`,
    station,
    lines,
    railLines,
    busLines,
    entranceCount,
  };
}

function createLineResult(line: GlobalMapLine, prefix: string): SearchResult {
  return { kind: "line", key: `${prefix}:line:${line.id}`, line, stationCount: line.stationIds.length };
}

function placeResultKey(place: GeocoderPoint): string {
  return place.id ?? `${place.label ?? "place"}:${place.lon}:${place.lat}`;
}

function placeCity(place: GeocoderPoint): string {
  return place.city?.trim() || place.postcode?.trim() || t("globalMap.search.cityFallback");
}

function placePresentation(place: GeocoderPoint) {
  return presentPlace(place);
}

function cancelScheduledSearch(): void {
  if (localSearchFrame === undefined || typeof window === "undefined") return;
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(localSearchFrame);
  window.clearTimeout(localSearchFrame);
  localSearchFrame = undefined;
}

function scheduleLocalSearch(): void {
  cancelScheduledSearch();
  if (typeof window === "undefined") {
    localQuery.value = query.value;
    return;
  }

  const commit = () => {
    localSearchFrame = undefined;
    localQuery.value = query.value;
  };
  localSearchFrame = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(commit)
    : window.setTimeout(commit, 0);
}

function cancelPlaceSearch(): void {
  if (placeSearchTimer !== undefined && typeof window !== "undefined") window.clearTimeout(placeSearchTimer);
  placeSearchTimer = undefined;
  placeSearchController?.abort();
  placeSearchController = undefined;
  placeSearchLoading.value = false;
}

function cachePlaceResults(queryKey: string, places: GeocoderPoint[]): GeocoderPoint[] {
  const cached = [...places];
  placeSearchCache.delete(queryKey);
  placeSearchCache.set(queryKey, cached);
  while (placeSearchCache.size > MAX_PLACE_SEARCH_CACHE_ENTRIES) {
    const oldest = placeSearchCache.keys().next().value;
    if (oldest === undefined) break;
    placeSearchCache.delete(oldest);
  }
  return cached;
}

function filterPlaceResults(points: GeocoderPoint[]): GeocoderPoint[] {
  const seen = new Set<string>();
  return points
    .filter((point) => point.type === "place" && Number.isFinite(point.lon) && Number.isFinite(point.lat))
    .filter((point) => {
      const key = placeResultKey(point);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function runPlaceSearch(searchValue: string, queryKey: string, version: number): Promise<void> {
  const searchPlaces = props.searchPlaces;
  if (!searchPlaces || version !== searchVersion) return;

  const cached = placeSearchCache.get(queryKey);
  if (cached) {
    placeSearchCache.delete(queryKey);
    placeSearchCache.set(queryKey, cached);
    placeResults.value = cached;
    placeSearchError.value = false;
    placeSearchLoading.value = false;
    return;
  }

  const controller = new AbortController();
  placeSearchController = controller;
  placeSearchLoading.value = true;
  try {
    const points = await searchPlaces(searchValue, controller.signal);
    if (version !== searchVersion || controller.signal.aborted) return;
    placeResults.value = cachePlaceResults(queryKey, filterPlaceResults(points));
    placeSearchError.value = false;
  } catch (error) {
    if (version !== searchVersion || controller.signal.aborted || isAbortError(error)) return;
    placeResults.value = [];
    placeSearchError.value = true;
  } finally {
    if (version === searchVersion && placeSearchController === controller) {
      placeSearchController = undefined;
      placeSearchLoading.value = false;
    }
  }
}

function requestCatalogIfNeeded(): void {
  if (!props.catalogReady && !props.catalogLoading) emit("request-catalog");
}

function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  query.value = value;
  activeIndex.value = -1;
  requestCatalogIfNeeded();

  searchVersion += 1;
  cancelScheduledSearch();
  cancelPlaceSearch();
  placeResults.value = [];
  placeSearchError.value = false;
  scheduleLocalSearch();

  const searchValue = value.trim();
  const queryKey = normalizeGlobalMapSearchText(searchValue);
  if (!props.searchPlaces || queryKey.length < MIN_PLACE_SEARCH_QUERY_LENGTH) return;

  const version = searchVersion;
  const cached = placeSearchCache.get(queryKey);
  if (cached) {
    placeSearchCache.delete(queryKey);
    placeSearchCache.set(queryKey, cached);
    placeResults.value = cached;
    placeSearchLoading.value = false;
    return;
  }

  placeSearchLoading.value = true;
  placeSearchTimer = window.setTimeout(() => {
    placeSearchTimer = undefined;
    void runPlaceSearch(searchValue, queryKey, version);
  }, GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
}

function onFocus(): void {
  requestCatalogIfNeeded();
}

function openSearch(): void {
  emit("update:open", true);
  emit("open");
  void nextTick(() => searchInput.value?.focus());
}

function closeSearch(): void {
  clearQuery(false);
  emit("update:open", false);
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveActiveResult(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActiveResult(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const result = visibleResults.value[activeIndex.value] ?? visibleResults.value[0];
    if (result) selectResult(result);
  } else if (event.key === "Escape") {
    event.preventDefault();
    if (query.value) clearQuery();
    else closeSearch();
  }
}

function moveActiveResult(direction: 1 | -1): void {
  const count = visibleResults.value.length;
  if (!count) return;
  activeIndex.value = (activeIndex.value + direction + count) % count;
}

function selectResult(result: SearchResult): void {
  if (result.kind !== "place" && result.kind !== "marker") rememberSearch(result);
  clearQuery(false);
  closeSearch();
  if (result.kind === "station") emit("select-station", result.station);
  else if (result.kind === "line") emit("select-line", result.line);
  else if (result.kind === "place") emit("select-place", result.place);
  else emit("select-marker", result.marker);
}

function clearQuery(focus = true): void {
  searchVersion += 1;
  cancelScheduledSearch();
  cancelPlaceSearch();
  query.value = "";
  localQuery.value = "";
  placeResults.value = [];
  placeSearchError.value = false;
  activeIndex.value = -1;
  if (focus) void nextTick(() => searchInput.value?.focus());
}

function isActiveResult(result: SearchResult): boolean {
  return activeResultKey.value === result.key;
}

function resultDomId(result: SearchResult): string {
  return `global-map-search-result-${result.kind}-${result.key.replace(/[^a-z0-9_-]/giu, "-")}`;
}

function lineLabel(line: GlobalMapLine): string {
  return line.label || line.code;
}

function lineFamily(mode: GlobalMapMode): TransitFamily | undefined {
  if (mode === "METRO" || mode === "RER" || mode === "BUS" || mode === "TRAM" || mode === "NOCTILIEN" || mode === "TRANSILIEN" || mode === "CABLE") {
    return mode;
  }

  if (mode === "TRAIN") {
    return "TRANSILIEN";
  }

  return undefined;
}

function lineBadge(line: GlobalMapLine) {
  const family = lineFamily(line.mode);
  const mode = family ? transitFamilyToMode(family) : undefined;
  const label = lineLabel(line);
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode,
    ref: line.sourceLineId ?? line.id,
    shortName: label,
    textColor: line.textColor,
  });
  const iconUrls = Array.from(new Set([
    ...(line.pictogram ? [line.pictogram] : []),
    ...(presentation.iconUrls ?? []),
  ]));

  return {
    id: line.id,
    label,
    mode,
    family,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: line.pictogram ?? presentation.iconUrl,
    iconUrls,
    ref: line.sourceLineId ?? line.id,
  };
}

function modeLabel(mode: GlobalMapMode): string {
  const keys: Record<GlobalMapMode, string> = {
    BUS: "bus",
    METRO: "metro",
    RER: "rer",
    TRAIN: "train",
    TRANSILIEN: "transilien",
    TRAM: "tram",
    CABLE: "cable",
    NOCTILIEN: "noctilien",
    BIKE: "bike",
  };
  return t(`globalMap.modes.${keys[mode]}` as never);
}

function isBusExpanded(key: string): boolean {
  return expandedStationKeys.value.has(key);
}

function expandBusLines(key: string): void {
  expandedStationKeys.value = new Set([...expandedStationKeys.value, key]);
}

function scheduleBusReveal(result: SearchResult): void {
  if (result.kind !== "station" || !result.busLines.length || isBusExpanded(result.key)) return;
  const previous = hoverTimers.get(result.key);
  if (previous !== undefined) window.clearTimeout(previous);
  hoverTimers.set(result.key, window.setTimeout(() => {
    expandBusLines(result.key);
    hoverTimers.delete(result.key);
  }, GLOBAL_TRANSPORT_PLAN_CONFIG.search.busRevealHoverMs));
}

function cancelBusReveal(result: SearchResult): void {
  const previous = hoverTimers.get(result.key);
  if (previous !== undefined) {
    window.clearTimeout(previous);
    hoverTimers.delete(result.key);
  }
}

function rememberSearch(result: SearchResult): void {
  if (result.kind !== "station" && result.kind !== "line") return;
  const entry: RecentSearchKey = result.kind === "station"
    ? { kind: "station", id: result.station.id }
    : { kind: "line", id: result.line.id };
  recentSearches.value = [entry, ...recentSearches.value.filter((candidate) => candidate.kind !== entry.kind || candidate.id !== entry.id)].slice(0, MAX_RECENT_SEARCHES);
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentSearches.value));
  } catch {
    // Local storage is optional in private browsing and some WebViews.
  }
}

function readRecentSearches(): RecentSearchKey[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "null") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentSearchKey => Boolean(entry) && (entry.kind === "station" || entry.kind === "line") && typeof entry.id === "string").slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}
</script>

<template>
  <section
    v-if="!open"
    class="global-map-search global-map-search--closed"
    data-global-map-search
    :aria-label="t('globalMap.search.aria')"
    @pointerdown.stop
  >
    <button class="global-map-search__open" type="button" @click="openSearch">
      <Search :size="20" aria-hidden="true" />
      <span>{{ t("globalMap.search.open") }}</span>
    </button>
  </section>

  <section
    v-else
    class="global-map-search"
    data-global-map-search
    :aria-label="t('globalMap.search.aria')"
    @pointerdown.stop
  >
    <div class="global-map-search__bar">
      <Search class="global-map-search__icon" :size="24" aria-hidden="true" />
      <input
        ref="searchInput"
        class="global-map-search__input"
        :value="query"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        aria-controls="global-map-search-results"
        :aria-activedescendant="activeResultKey ? resultDomId(visibleResults[activeIndex]!) : undefined"
        :placeholder="t('globalMap.search.placeholder')"
        :aria-label="t('globalMap.search.inputAria')"
        autocomplete="off"
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button class="global-map-search__close" type="button" :aria-label="t('globalMap.search.close')" @click="closeSearch">
        <XIcon :size="20" :stroke-width="2.25" aria-hidden="true" />
      </button>
      <button v-if="query" class="global-map-search__clear" type="button" :aria-label="t('globalMap.search.clear')" @click="clearQuery(true)">
        <XIcon :size="16" :stroke-width="2.25" aria-hidden="true" />
      </button>
    </div>

    <div v-if="isLoading" class="global-map-search__results global-map-search__results--skeleton" role="status" aria-live="polite" :aria-label="t('globalMap.search.loading')">
      <div v-for="index in 5" :key="index" class="global-map-search__skeleton-row">
        <span class="global-map-search__skeleton-icon"></span>
        <span class="global-map-search__skeleton-copy"><i></i><i></i></span>
        <span class="global-map-search__skeleton-chip"></span>
      </div>
    </div>

    <div v-else id="global-map-search-results" class="global-map-search__results" role="listbox" :aria-label="t('globalMap.search.resultsAria')" :aria-busy="placeSearchLoading">
      <section v-for="section in sections" :key="section.id" class="global-map-search__section">
        <h2>{{ section.label }}</h2>
        <template v-for="result in section.results" :key="result.key">
          <button
            v-if="result.kind === 'station'"
            :id="resultDomId(result)"
            type="button"
            role="option"
            class="global-map-search__result"
            :class="{ 'global-map-search__result--active': isActiveResult(result) }"
            :aria-selected="isActiveResult(result)"
            @pointerenter="scheduleBusReveal(result)"
            @pointerleave="cancelBusReveal(result)"
            @focus="expandBusLines(result.key)"
            @click="selectResult(result)"
          >
            <span class="global-map-search__result-icon" :class="{ 'global-map-search__result-icon--major': result.station.lineIds.length >= GLOBAL_TRANSPORT_PLAN_CONFIG.search.majorStationMinLines }" aria-hidden="true">
              <Train v-if="result.station.lineIds.length >= GLOBAL_TRANSPORT_PLAN_CONFIG.search.majorStationMinLines" :size="18" />
              <span v-else>⌾</span>
            </span>
            <span class="global-map-search__result-copy">
              <strong>{{ result.station.name }}</strong>
              <small>
                {{ result.station.city ?? t("globalMap.search.cityFallback") }}
                <template v-if="result.entranceCount"> · {{ result.entranceCount }} {{ result.entranceCount > 1 ? t("globalMap.search.exitsOther") : t("globalMap.search.exitsOne") }}</template>
              </small>
            </span>
            <span class="global-map-search__chips" :aria-label="t('globalMap.search.servingLinesAria')">
              <LineIconBadge v-for="line in (isBusExpanded(result.key) ? result.lines : result.railLines).slice(0, 8)" :key="line.id" class="global-map-search__line-chip" :line="lineBadge(line)" compact />
              <span v-if="result.busLines.length && !isBusExpanded(result.key)" class="global-map-search__bus-more" role="button" tabindex="0" @click.stop="expandBusLines(result.key)" @keydown.enter.stop="expandBusLines(result.key)">{{ t("globalMap.search.showOtherLines", { count: result.busLines.length }) }}</span>
            </span>
            <ChevronRight class="global-map-search__arrow" :size="20" aria-hidden="true" />
          </button>

          <button
            v-else-if="result.kind === 'line'"
            :id="resultDomId(result)"
            type="button"
            role="option"
            class="global-map-search__result"
            :class="{ 'global-map-search__result--active': isActiveResult(result) }"
            :aria-selected="isActiveResult(result)"
            @click="selectResult(result)"
          >
            <LineIconBadge class="global-map-search__line-chip global-map-search__line-chip--large" :line="lineBadge(result.line)" />
            <span class="global-map-search__result-copy"><strong>{{ t("globalMap.search.lineName", { line: lineLabel(result.line) }) }}</strong><small>{{ modeLabel(result.line.mode) }} · {{ result.stationCount || t("globalMap.search.network") }}</small></span>
            <span class="global-map-search__result-action">{{ t("globalMap.search.viewLine") }}</span>
            <ChevronRight class="global-map-search__arrow" :size="20" aria-hidden="true" />
          </button>

          <button
            v-else-if="result.kind === 'marker'"
            :id="resultDomId(result)"
            data-global-map-search-result-type="marker"
            type="button"
            role="option"
            class="global-map-search__result"
            :class="{ 'global-map-search__result--active': isActiveResult(result) }"
            :aria-selected="isActiveResult(result)"
            @click="selectResult(result)"
          >
            <span
              class="global-map-search__result-icon global-map-search__result-icon--marker"
              :style="{ '--global-map-search-marker-color': result.marker.color ?? '#5146ff' }"
              aria-hidden="true"
            >
              <component :is="resolveGlobalMapMarkerIcon(result.marker.icon)" :size="18" />
            </span>
            <span class="global-map-search__result-copy">
              <strong>{{ result.marker.name }}</strong>
              <small>{{ result.marker.address || t("globalMap.search.savedMarker") }}</small>
            </span>
            <span class="global-map-search__result-action">{{ t("globalMap.search.centerMarker") }}</span>
            <ChevronRight class="global-map-search__arrow" :size="20" aria-hidden="true" />
          </button>

          <button
            v-else
            :id="resultDomId(result)"
            data-global-map-search-result-type="place"
            type="button"
            role="option"
            class="global-map-search__result"
            :class="{ 'global-map-search__result--active': isActiveResult(result) }"
            :aria-selected="isActiveResult(result)"
            @click="selectResult(result)"
          >
            <span
              class="global-map-search__result-icon global-map-search__result-icon--place"
              :data-global-map-place-icon="placePresentation(result.place).iconId"
              aria-hidden="true"
            >
              <component :is="placePresentation(result.place).icon" :size="18" />
            </span>
            <span class="global-map-search__result-copy">
              <strong>{{ placePresentation(result.place).name }}</strong>
              <small>{{ placeCity(result.place) }} · {{ placePresentation(result.place).typeLabel }}</small>
            </span>
            <span class="global-map-search__result-action">{{ t("globalMap.search.centerPlace") }}</span>
            <ChevronRight class="global-map-search__arrow" :size="20" aria-hidden="true" />
          </button>
        </template>
      </section>

      <p v-if="placeSearchLoading" class="global-map-search__status" role="status" aria-live="polite">{{ t("globalMap.search.loading") }}</p>
      <p v-else-if="placeSearchError" class="global-map-search__status global-map-search__status--error" role="alert">{{ t("globalMap.search.placeSearchUnavailable") }}</p>
      <p v-if="noResults" class="global-map-search__empty" role="status">{{ t("globalMap.search.empty") }}</p>
      <p v-else-if="catalogHint" class="global-map-search__empty" role="status">{{ t("globalMap.search.catalogPreparing") }}</p>
      <p v-else-if="!sections.length" class="global-map-search__empty" role="status">{{ t("globalMap.search.noAvailable") }}</p>
    </div>
  </section>
</template>

<style scoped>
.global-map-search {
  position: absolute;
  z-index: 7;
  top: 16px;
  left: 50%;
  width: min(680px, calc(100% - 32px));
  transform: translateX(-50%);
  color: #17213d;
  pointer-events: auto;
}

.global-map-search--closed { width: auto; }
.global-map-search__open,
.global-map-search__bar { display: flex; align-items: center; min-height: 58px; border: 1px solid rgba(217, 224, 237, .95); border-radius: 17px; background: rgba(255, 255, 255, .97); box-shadow: 0 10px 32px rgba(27, 48, 87, .15), 0 2px 6px rgba(27, 48, 87, .06); }
.global-map-search__open { gap: 10px; padding: 0 18px; color: #17213d; font: 800 .82rem/1 inherit; cursor: pointer; }
.global-map-search__open:hover, .global-map-search__open:focus-visible { border-color: #7da5ed; outline: none; }
.global-map-search__bar { padding: 0 10px 0 18px; }
.global-map-search__icon { flex: 0 0 auto; color: #111c38; }
.global-map-search__input { min-width: 0; flex: 1; height: 56px; padding: 0 11px; border: 0; outline: none; background: transparent; color: #17213d; font: 600 .92rem/1.2 inherit; }
.global-map-search__input::placeholder { color: #8994ad; opacity: 1; }
.global-map-search__close, .global-map-search__clear { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border: 1px solid #cbd4e5; border-radius: 50%; background: #fff; color: #65718a; cursor: pointer; }
.global-map-search__close svg, .global-map-search__clear svg { display: block; flex: 0 0 auto; }
.global-map-search__close { width: 36px; height: 36px; }
.global-map-search__clear { width: 28px; height: 28px; margin-left: 6px; }
.global-map-search__close:hover, .global-map-search__close:focus-visible, .global-map-search__clear:hover, .global-map-search__clear:focus-visible { border-color: #6e9cff; color: #1e4cb3; outline: none; }
.global-map-search__results { max-height: min(66vh, 620px); overflow: auto; margin-top: 4px; padding: 10px 8px 8px; border: 1px solid rgba(217, 224, 237, .9); border-radius: 0 0 17px 17px; background: rgba(255, 255, 255, .98); box-shadow: 0 18px 42px rgba(27, 48, 87, .14); }
.global-map-search__section + .global-map-search__section { margin-top: 8px; padding-top: 8px; border-top: 1px solid #edf0f6; }
.global-map-search__section h2 { margin: 0; padding: 2px 12px 5px; color: #4e5b75; font-size: .62rem; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.global-map-search__result { display: flex; align-items: center; width: 100%; min-height: 62px; gap: 10px; padding: 8px 10px; border: 1px solid transparent; border-radius: 12px; background: transparent; color: #17213d; text-align: left; cursor: pointer; }
.global-map-search__result:hover, .global-map-search__result:focus-visible, .global-map-search__result--active { border-color: #91b5ff; background: #f1f6ff; outline: none; }
.global-map-search__result-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; border: 1px solid #b8c5de; border-radius: 50%; background: #f8faff; color: #36558f; }
.global-map-search__result-icon--major { border-color: #6aa9e8; background: #edf7ff; color: #1661a7; }
.global-map-search__result-icon--place { border-color: #83c8ad; background: #effbf6; color: #147a58; }
.global-map-search__result-icon--marker { border-color: color-mix(in srgb, var(--global-map-search-marker-color, #5146ff) 58%, #fff); background: color-mix(in srgb, var(--global-map-search-marker-color, #5146ff) 10%, #fff); color: var(--global-map-search-marker-color, #5146ff); }
.global-map-search__result-copy { display: grid; min-width: 142px; flex: 1 1 190px; gap: 3px; }
.global-map-search__result-copy strong { overflow: hidden; font-size: .86rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.global-map-search__result-copy small { overflow: hidden; color: #75829c; font-size: .69rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.global-map-search__chips { display: flex; flex: 0 1 auto; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 250px; }
.global-map-search__line-chip { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-width: 42px; min-height: 30px; padding: 0; border-radius: 5px; line-height: 1; white-space: nowrap; }
.global-map-search__line-chip--large { flex-basis: 58px; min-width: 58px; min-height: 36px; border-radius: 8px; }
.global-map-search__line-chip :deep(.line-icon-badge__fallback) { height: 28px; }
.global-map-search__line-chip--large :deep(.line-icon-badge__fallback) { height: 34px; }
.global-map-search__bus-more { color: #365fc1; font-size: .62rem; font-weight: 850; cursor: pointer; }
.global-map-search__result-action { flex: 0 0 auto; color: #5f76a8; font-size: .68rem; font-weight: 750; }
.global-map-search__arrow { flex: 0 0 auto; color: #254e9a; }
.global-map-search__status { margin: 8px 12px 4px; color: #66748f; font-size: .72rem; font-weight: 700; }
.global-map-search__status--error { color: #a33d4b; }
.global-map-search__empty { padding: 22px 14px 18px; color: #75829c; font-size: .78rem; font-weight: 700; text-align: center; }
.global-map-search__skeleton-row { display: flex; align-items: center; gap: 10px; min-height: 62px; padding: 8px 10px; }
.global-map-search__skeleton-icon, .global-map-search__skeleton-chip, .global-map-search__skeleton-copy i { display: block; background: linear-gradient(90deg, #edf1f8, #f8faff, #edf1f8); background-size: 200% 100%; animation: global-map-search-shimmer 1.1s linear infinite; }
.global-map-search__skeleton-icon { width: 32px; height: 32px; border-radius: 50%; }
.global-map-search__skeleton-copy { display: grid; flex: 1; gap: 7px; }
.global-map-search__skeleton-copy i:first-child { width: 52%; height: 10px; border-radius: 5px; }
.global-map-search__skeleton-copy i:last-child { width: 36%; height: 8px; border-radius: 5px; }
.global-map-search__skeleton-chip { width: 42px; height: 24px; border-radius: 6px; }
@keyframes global-map-search-shimmer { to { background-position: -200% 0; } }
@media (max-width: 700px) { .global-map-search { top: 10px; width: calc(100% - 20px); } .global-map-search--closed { width: auto; } .global-map-search__result-action { display: none; } .global-map-search__chips { max-width: 130px; } }
</style>
