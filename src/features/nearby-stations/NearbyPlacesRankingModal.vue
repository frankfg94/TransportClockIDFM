<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from "vue";
import { LoaderCircle, RefreshCw, Search, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import {
  PLACES_RANKING_CATEGORY_IDS,
  type PlacesRankingBucket,
  type PlacesRankingCategory,
  type PlacesRankingDocument,
} from "../../services/places/compiledPlaces";

const props = withDefaults(defineProps<{
  open: boolean;
  cityCode?: string;
  cityName?: string;
  ranking?: PlacesRankingDocument;
  /** Official commune populations already loaded by the IRIS city view. */
  populationByCity?: Readonly<Record<string, number>>;
  /** Teleport into the fullscreen map shell when the map owns fullscreen. */
  teleportTarget?: string;
  loading?: boolean;
  error?: string;
}>(), {
  loading: false,
  error: "",
  teleportTarget: "body",
});

const emit = defineEmits<{
  close: [];
  retry: [];
}>();

const { n, t } = useI18n();
const categories = PLACES_RANKING_CATEGORY_IDS;
const cityRanking = computed(() => props.ranking?.cities.find((city) => city.code === props.cityCode));
const CITY_LEADERBOARD_LIMIT = 8;
type RankingScope = "idf" | "petite-couronne" | "grande-couronne" | "paris-intramuros";
type ScopeOption = { id: RankingScope; label: string };
type DisplayBucket = PlacesRankingBucket & {
  population?: number;
  ratioPerThousand?: number;
  normalized: boolean;
  scopeCityCount: number;
};
type ScopedCityRow = {
  city: PlacesRankingDocument["cities"][number];
  count: number;
  population: number;
  ratioPerThousand: number;
  rank: number;
  topPercent: number;
  scorePercent: number;
};
/**
 * Bar score for a rank inside a comparison scope. It mirrors the published
 * dataset and the ridership ranking card: the best commune fills the gauge,
 * the last one empties it. Scoring the raw density against the best commune
 * instead would let one outlier (a 12-resident commune with a handful of
 * places) flatten every other gauge to a dot.
 */
function scorePercentForRank(rank: number, total: number): number {
  if (total <= 1) return 100;
  const rankIndex = Math.min(Math.max(rank, 1), total) - 1;
  return Math.round(100 - rankIndex / (total - 1) * 100);
}
type ScopedDepartmentRow = {
  departmentCode: string;
  cityCount: number;
  placeCount: number;
  population: number;
  ratioPerThousand: number;
  rank: number;
  topPercent: number;
};

const activeScope = ref<RankingScope>("idf");
const hasPopulationData = computed(() => Object.keys(props.populationByCity ?? {}).length > 0);
const scopeOptions = computed<ScopeOption[]>(() => {
  const options: ScopeOption[] = [{ id: "idf", label: t("nearbyStations.placesRanking.scopeIdf") }];
  if (!hasPopulationData.value) return options;
  const city = cityRanking.value;
  if (!city || populationForCity(city) === undefined) return options;
  const department = city.departmentCode;
  if (department === "75") options.push({ id: "paris-intramuros", label: t("nearbyStations.placesRanking.scopeParisIntramuros") });
  else if (["92", "93", "94"].includes(department ?? "")) options.push({ id: "petite-couronne", label: t("nearbyStations.placesRanking.scopePetiteCouronne") });
  else if (["77", "78", "91", "95"].includes(department ?? "")) options.push({ id: "grande-couronne", label: t("nearbyStations.placesRanking.scopeGrandeCouronne") });
  return options;
});

function cityBelongsToScope(city: PlacesRankingDocument["cities"][number], scope: RankingScope): boolean {
  if (scope === "idf") return true;
  if (scope === "paris-intramuros") return city.departmentCode === "75";
  if (scope === "petite-couronne") return ["92", "93", "94"].includes(city.departmentCode);
  return ["77", "78", "91", "95"].includes(city.departmentCode);
}

function populationForCity(city: PlacesRankingDocument["cities"][number]): number | undefined {
  const population = props.populationByCity?.[city.code];
  return typeof population === "number" && Number.isFinite(population) && population > 0 ? population : undefined;
}

const scopedRowsByCategory = computed<Record<PlacesRankingCategory, ScopedCityRow[]>>(() => {
  const result = {} as Record<PlacesRankingCategory, ScopedCityRow[]>;
  const cities = (props.ranking?.cities ?? []).filter((city) => cityBelongsToScope(city, activeScope.value));
  for (const category of categories) {
    const rows = cities.flatMap((city) => {
      const population = populationForCity(city);
      if (population === undefined) return [];
      const count = city.categories[category].count;
      return [{ city, count, population, ratioPerThousand: count / population * 1000, rank: 0, topPercent: 100, scorePercent: 0 }];
    });
    rows.sort((left, right) => right.ratioPerThousand - left.ratioPerThousand
      || right.count - left.count || left.city.name.localeCompare(right.city.name, "fr-FR"));
    rows.forEach((row, index) => {
      row.rank = index + 1;
      row.topPercent = Math.max(1, Math.ceil(row.rank / Math.max(1, rows.length) * 100));
      row.scorePercent = scorePercentForRank(row.rank, rows.length);
    });
    result[category] = rows;
  }
  return result;
});

const scopedDepartmentsByCategory = computed<Record<PlacesRankingCategory, ScopedDepartmentRow[]>>(() => {
  const result = {} as Record<PlacesRankingCategory, ScopedDepartmentRow[]>;
  for (const category of categories) {
    const aggregateByDepartment = new Map<string, { cityCount: number; placeCount: number; population: number }>();
    for (const row of scopedRowsByCategory.value[category] ?? []) {
      const current = aggregateByDepartment.get(row.city.departmentCode) ?? { cityCount: 0, placeCount: 0, population: 0 };
      current.cityCount += 1;
      current.placeCount += row.count;
      current.population += row.population;
      aggregateByDepartment.set(row.city.departmentCode, current);
    }
    const rows = [...aggregateByDepartment.entries()].map(([departmentCode, aggregate]) => ({
      departmentCode,
      ...aggregate,
      ratioPerThousand: aggregate.population > 0 ? aggregate.placeCount / aggregate.population * 1000 : 0,
      rank: 0,
      topPercent: 100,
    }));
    rows.sort((left, right) => right.ratioPerThousand - left.ratioPerThousand
      || right.placeCount - left.placeCount || left.departmentCode.localeCompare(right.departmentCode));
    rows.forEach((row, index) => {
      row.rank = index + 1;
      row.topPercent = Math.max(1, Math.ceil(row.rank / Math.max(1, rows.length) * 100));
    });
    result[category] = rows;
  }
  return result;
});

const displayedBuckets = computed<Record<PlacesRankingCategory, DisplayBucket>>(() => {
  const result = {} as Record<PlacesRankingCategory, DisplayBucket>;
  for (const category of categories) {
    const source = cityRanking.value?.categories[category];
    const current = scopedRowsByCategory.value[category]?.find((row) => row.city.code === cityRanking.value?.code);
    result[category] = {
      ...(source ?? { count: 0, rank: 1, topPercent: 100, scorePercent: 0 }),
      ...(current ? {
        rank: current.rank,
        topPercent: current.topPercent,
        scorePercent: current.scorePercent,
        population: current.population,
        ratioPerThousand: current.ratioPerThousand,
        normalized: true,
        scopeCityCount: scopedRowsByCategory.value[category]?.length ?? 0,
      } : {
        normalized: false,
        scopeCityCount: scopedRowsByCategory.value[category]?.length ?? 0,
      }),
    };
  }
  return result;
});

function scopeTopLabel(bucket: DisplayBucket): string {
  if (activeScope.value === "idf") return t("nearbyStations.placesRanking.topPercent", { percent: bucket.topPercent });
  return t("nearbyStations.placesRanking.topPercentScope", { percent: bucket.topPercent, scope: scopeTopSuffix(activeScope.value) });
}

function scopeTopSuffix(scope: RankingScope): string {
  if (scope === "petite-couronne") return t("nearbyStations.placesRanking.scopeTopPetiteCouronne");
  if (scope === "grande-couronne") return t("nearbyStations.placesRanking.scopeTopGrandeCouronne");
  if (scope === "paris-intramuros") return t("nearbyStations.placesRanking.scopeTopParisIntramuros");
  return t("nearbyStations.placesRanking.scopeTopIdf");
}

function ratioLabel(bucket: DisplayBucket): string | undefined {
  if (bucket.ratioPerThousand === undefined) return undefined;
  return t("nearbyStations.placesRanking.perThousand", {
    ratio: n(bucket.ratioPerThousand, { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
  });
}

/** Keep the last-ranked commune readable instead of rendering a bare track. */
function barWidth(scorePercent: number): number {
  return Math.max(2, Math.min(100, scorePercent));
}
type LeaderboardTab = "cities" | "departments";
type CityLeaderboardEntry = {
  code: string;
  name: string;
  placeCount: number;
  ratioPerThousand?: number;
  rank: number;
  current: boolean;
};
type DepartmentLeaderboardEntry = {
  departmentCode: string;
  cityCount: number;
  placeCount: number;
  ratioPerThousand?: number;
  rank: number;
  topPercent: number;
};

const hoveredLeaderboardCategory = ref<PlacesRankingCategory>();
const lockedLeaderboardCategory = ref<PlacesRankingCategory>();
const activeLeaderboardTab = ref<LeaderboardTab>("cities");
const leaderboardTooltipRefs = new Map<PlacesRankingCategory, HTMLElement>();

function categoryLabel(category: PlacesRankingCategory): string {
  return t(`nearbyStations.placesRanking.categories.${category}` as never);
}

function regionalTopLabel(category: PlacesRankingCategory): string | undefined {
  const bucket = cityRanking.value?.categories[category];
  if (!bucket?.regionalScope || bucket.regionalTopPercent === undefined) return undefined;
  return bucket.regionalScope === "petite-couronne"
    ? t("nearbyStations.placesRanking.topPercentPetiteCouronne", { percent: bucket.regionalTopPercent })
    : t("nearbyStations.placesRanking.topPercentParis", { percent: bucket.regionalTopPercent });
}

function departmentPositionLabel(category: PlacesRankingCategory): string | undefined {
  const city = cityRanking.value;
  const normalizedDepartment = scopedDepartmentsByCategory.value[category]?.find((entry) => entry.departmentCode === city?.departmentCode);
  if (city && populationForCity(city) !== undefined && normalizedDepartment) {
    return t("nearbyStations.placesRanking.departmentRank", {
      rank: normalizedDepartment.rank,
      total: normalizedDepartment.cityCount,
      department: city?.departmentCode ?? "",
    });
  }
  const bucket = city?.categories[category];
  if (!city || bucket?.departmentRank === undefined || bucket.departmentCityCount === undefined) return undefined;
  return t("nearbyStations.placesRanking.departmentRank", {
    rank: bucket.departmentRank,
    total: bucket.departmentCityCount,
    department: city.departmentCode,
  });
}

function cityLeaderboard(category: PlacesRankingCategory): CityLeaderboardEntry[] {
  const currentCity = cityRanking.value;
  const ranking = props.ranking;
  if (!currentCity || !ranking) return [];

  const normalizedEntries = scopedRowsByCategory.value[category] ?? [];
  if (normalizedEntries.length > 0 && populationForCity(currentCity) !== undefined) {
    const visibleEntries = normalizedEntries.slice(0, CITY_LEADERBOARD_LIMIT).map((entry) => ({
      code: entry.city.code,
      name: entry.city.name,
      placeCount: entry.count,
      ratioPerThousand: entry.ratioPerThousand,
      rank: entry.rank,
      current: entry.city.code === currentCity.code,
    }));
    const currentEntry = normalizedEntries.find((entry) => entry.city.code === currentCity.code);
    if (currentEntry && !visibleEntries.some((entry) => entry.current)) visibleEntries.push({
      code: currentEntry.city.code,
      name: currentEntry.city.name,
      placeCount: currentEntry.count,
      ratioPerThousand: currentEntry.ratioPerThousand,
      rank: currentEntry.rank,
      current: true,
    });
    return visibleEntries;
  }

  const entries = ranking.cities
    .map((city) => {
      const bucket = city.categories[category];
      return {
        code: city.code,
        name: city.name,
        placeCount: bucket.count,
        rank: bucket.rank,
        current: city.code === currentCity.code,
      };
    })
    .sort((left, right) => left.rank - right.rank
      || right.placeCount - left.placeCount
      || left.name.localeCompare(right.name, "fr-FR"));

  const visibleEntries = entries.slice(0, CITY_LEADERBOARD_LIMIT);
  const currentEntry = entries.find((entry) => entry.current);
  if (currentEntry && !visibleEntries.some((entry) => entry.current)) visibleEntries.push(currentEntry);
  return visibleEntries;
}

function departmentLeaderboard(category: PlacesRankingCategory): DepartmentLeaderboardEntry[] {
  const normalizedEntries = scopedDepartmentsByCategory.value[category] ?? [];
  const currentCity = cityRanking.value;
  if (normalizedEntries.length > 0 && currentCity && populationForCity(currentCity) !== undefined) {
    const visibleEntries = normalizedEntries.slice(0, CITY_LEADERBOARD_LIMIT).map((entry) => ({
      departmentCode: entry.departmentCode,
      cityCount: entry.cityCount,
      placeCount: entry.placeCount,
      ratioPerThousand: entry.ratioPerThousand,
      rank: entry.rank,
      topPercent: entry.topPercent,
    }));
    const currentDepartment = currentCity.departmentCode;
    const currentEntry = currentDepartment
      ? normalizedEntries.find((entry) => entry.departmentCode === currentDepartment)
      : undefined;
    if (currentEntry && !visibleEntries.some((entry) => entry.departmentCode === currentEntry.departmentCode)) {
      visibleEntries.push({
        departmentCode: currentEntry.departmentCode,
        cityCount: currentEntry.cityCount,
        placeCount: currentEntry.placeCount,
        ratioPerThousand: currentEntry.ratioPerThousand,
        rank: currentEntry.rank,
        topPercent: currentEntry.topPercent,
      });
    }
    return visibleEntries;
  }

  const entries = props.ranking?.departmentLeaderboards?.[category] ?? [];
  const currentDepartment = cityRanking.value?.departmentCode;
  const visibleEntries = entries
    .slice()
    .sort((left, right) => left.rank - right.rank || right.placeCount - left.placeCount)
    .slice(0, CITY_LEADERBOARD_LIMIT);
  const currentEntry = currentDepartment
    ? entries.find((entry) => entry.departmentCode === currentDepartment)
    : undefined;
  if (currentEntry && !visibleEntries.some((entry) => entry.departmentCode === currentEntry.departmentCode)) {
    visibleEntries.push(currentEntry);
  }
  return visibleEntries;
}

function leaderboardTabId(category: PlacesRankingCategory, tab: LeaderboardTab): string {
  return `nearby-places-ranking-${category}-${tab}-tab`;
}

function leaderboardPanelId(category: PlacesRankingCategory, tab: LeaderboardTab): string {
  return `nearby-places-ranking-${category}-${tab}-panel`;
}

function showLeaderboard(category: PlacesRankingCategory): void {
  if (lockedLeaderboardCategory.value && lockedLeaderboardCategory.value !== category) return;
  if (cityLeaderboard(category).length > 0 || departmentLeaderboard(category).length > 0) {
    if (hoveredLeaderboardCategory.value !== category) activeLeaderboardTab.value = "cities";
    hoveredLeaderboardCategory.value = category;
  }
}

function hideLeaderboard(category: PlacesRankingCategory): void {
  if (!lockedLeaderboardCategory.value && hoveredLeaderboardCategory.value === category) {
    hoveredLeaderboardCategory.value = undefined;
  }
}

function setLeaderboardTooltipRef(category: PlacesRankingCategory, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) leaderboardTooltipRefs.set(category, element);
  else leaderboardTooltipRefs.delete(category);
}

function focusLeaderboardTooltip(category: PlacesRankingCategory): void {
  void nextTick(() => leaderboardTooltipRefs.get(category)?.focus({ preventScroll: true }));
}

function lockLeaderboard(category: PlacesRankingCategory, focus = true): void {
  showLeaderboard(category);
  lockedLeaderboardCategory.value = category;
  if (focus) focusLeaderboardTooltip(category);
}

function selectLeaderboardTab(category: PlacesRankingCategory, tab: LeaderboardTab): void {
  lockLeaderboard(category, false);
  activeLeaderboardTab.value = tab;
}

function handleLeaderboardFocusout(category: PlacesRankingCategory, event: FocusEvent): void {
  if (lockedLeaderboardCategory.value === category) return;
  const nextTarget = event.relatedTarget;
  const container = event.currentTarget;
  if (container instanceof HTMLElement && nextTarget instanceof Node && container.contains(nextTarget)) return;
  hideLeaderboard(category);
}

function handleLeaderboardTooltipClick(category: PlacesRankingCategory, event: MouseEvent): void {
  lockLeaderboard(category, event.target === event.currentTarget);
}

function closeLeaderboard(): void {
  hoveredLeaderboardCategory.value = undefined;
  lockedLeaderboardCategory.value = undefined;
  activeLeaderboardTab.value = "cities";
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!hoveredLeaderboardCategory.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest("[data-nearby-places-ranking-leaderboard]")) return;
  closeLeaderboard();
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) emit("close");
}

watch(() => props.cityCode, () => {
  activeScope.value = "idf";
});

watch(scopeOptions, (options) => {
  if (!options.some((option) => option.id === activeScope.value)) activeScope.value = "idf";
}, { flush: "post" });

watch(() => props.open, (open) => {
  if (!open) {
    closeLeaderboard();
    activeLeaderboardTab.value = "cities";
  }
  if (typeof document === "undefined") return;
  if (open) {
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
  } else {
    document.removeEventListener("keydown", closeOnEscape);
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }
}, { immediate: true });

onBeforeUnmount(() => {
  document.removeEventListener("keydown", closeOnEscape);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});
</script>

<template>
  <Teleport :to="teleportTarget">
    <div
      v-if="open"
      class="nearby-places-ranking-modal"
      data-testid="nearby-places-ranking-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="t('nearbyStations.placesRanking.title')"
    >
      <div class="nearby-places-ranking-modal__backdrop" @click="emit('close')" />
      <section class="nearby-places-ranking-modal__panel">
        <header class="nearby-places-ranking-modal__header">
          <div>
            <p class="nearby-places-ranking-modal__eyebrow">
              <Search :size="15" :stroke-width="2.5" aria-hidden="true" />
              {{ t("nearbyStations.placesRanking.eyebrow") }}
            </p>
            <h2>{{ t("nearbyStations.placesRanking.title") }}</h2>
            <p class="nearby-places-ranking-modal__city">{{ cityName || t("nearbyStations.cityInfoUnavailable") }}</p>
          </div>
          <button
            type="button"
            class="nearby-places-ranking-modal__close"
            :aria-label="t('nearbyStations.placesRanking.close')"
            :title="t('nearbyStations.placesRanking.close')"
            @click="emit('close')"
          >
            <X :size="21" :stroke-width="2.5" aria-hidden="true" />
          </button>
        </header>

        <div v-if="loading" class="nearby-places-ranking-modal__state" role="status">
          <LoaderCircle class="nearby-places-ranking-modal__spin" :size="28" aria-hidden="true" />
          <span>{{ t("nearbyStations.placesRanking.loading") }}</span>
        </div>
        <div v-else-if="error" class="nearby-places-ranking-modal__state nearby-places-ranking-modal__state--error" role="alert">
          <strong>{{ t("nearbyStations.placesRanking.unavailable") }}</strong>
          <span>{{ error }}</span>
          <button type="button" class="nearby-places-ranking-modal__retry" @click="emit('retry')">
            <RefreshCw :size="15" aria-hidden="true" />
            {{ t("nearbyStations.placesRanking.retry") }}
          </button>
        </div>
        <div v-else-if="cityRanking" class="nearby-places-ranking-modal__content">
          <div class="nearby-places-ranking-modal__scope-picker" role="tablist" :aria-label="t('nearbyStations.placesRanking.scopeSelector')">
            <button
              v-for="option in scopeOptions"
              :key="option.id"
              type="button"
              role="tab"
              class="nearby-places-ranking-modal__scope-option"
              :class="{ 'nearby-places-ranking-modal__scope-option--active': activeScope === option.id }"
              :aria-selected="activeScope === option.id"
              @click="activeScope = option.id"
            >{{ option.label }}</button>
          </div>
          <p class="nearby-places-ranking-modal__intro">{{ t("nearbyStations.placesRanking.description") }}</p>
          <div class="nearby-places-ranking-modal__rows">
            <article v-for="category in categories" :key="category" class="nearby-places-ranking-modal__row">
              <div class="nearby-places-ranking-modal__row-heading">
                <strong>{{ categoryLabel(category) }}</strong>
                <span>{{ t("nearbyStations.placesRanking.count", { count: n(displayedBuckets[category].count) }) }}</span>
              </div>
              <div class="nearby-places-ranking-modal__bar-track" role="progressbar" :aria-valuenow="displayedBuckets[category].scorePercent" aria-valuemin="0" aria-valuemax="100" :aria-label="categoryLabel(category)">
                <span class="nearby-places-ranking-modal__bar-fill" :style="{ width: `${barWidth(displayedBuckets[category].scorePercent)}%` }" />
              </div>
              <div class="nearby-places-ranking-modal__row-meta">
                <span>{{ t("nearbyStations.placesRanking.rank", { rank: displayedBuckets[category].rank }) }}</span>
                <div class="nearby-places-ranking-modal__scope-meta">
                  <b>{{ scopeTopLabel(displayedBuckets[category]) }}</b>
                  <b
                    v-if="!displayedBuckets[category].normalized && regionalTopLabel(category)"
                    class="nearby-places-ranking-modal__scope-label"
                  >{{ regionalTopLabel(category) }}</b>
                  <b v-if="ratioLabel(displayedBuckets[category])" class="nearby-places-ranking-modal__ratio-label">{{ ratioLabel(displayedBuckets[category]) }}</b>
                  <span
                    v-if="departmentPositionLabel(category)"
                    class="nearby-places-ranking-modal__leaderboard"
                    data-nearby-places-ranking-leaderboard
                    @mouseenter="showLeaderboard(category)"
                    @mouseleave="hideLeaderboard(category)"
                    @focusin="showLeaderboard(category)"
                    @focusout="handleLeaderboardFocusout(category, $event)"
                  >
                    <button
                      type="button"
                      class="nearby-places-ranking-modal__leaderboard-trigger"
                      aria-haspopup="dialog"
                      :aria-expanded="hoveredLeaderboardCategory === category"
                      @pointerdown.stop
                      @click.stop="lockLeaderboard(category)"
                    >{{ departmentPositionLabel(category) }}</button>
                    <span
                      v-if="hoveredLeaderboardCategory === category"
                      :ref="(element) => setLeaderboardTooltipRef(category, element)"
                      class="nearby-places-ranking-modal__leaderboard-tooltip"
                      role="dialog"
                      tabindex="-1"
                      :aria-label="t('nearbyStations.placesRanking.cityLeaderboardTitle')"
                      @pointerdown.stop
                      @click.stop="handleLeaderboardTooltipClick(category, $event)"
                    >
                      <div
                        class="nearby-places-ranking-modal__leaderboard-tabs"
                        role="tablist"
                        :aria-label="t('nearbyStations.placesRanking.title')"
                      >
                        <button
                          :id="leaderboardTabId(category, 'cities')"
                          type="button"
                          role="tab"
                          class="nearby-places-ranking-modal__leaderboard-tab"
                          :class="{ 'nearby-places-ranking-modal__leaderboard-tab--active': activeLeaderboardTab === 'cities' }"
                          :aria-selected="activeLeaderboardTab === 'cities'"
                          :aria-controls="leaderboardPanelId(category, 'cities')"
                          @click.stop="selectLeaderboardTab(category, 'cities')"
                        >{{ t("nearbyStations.placesRanking.cityLeaderboardTitle") }}</button>
                        <button
                          :id="leaderboardTabId(category, 'departments')"
                          type="button"
                          role="tab"
                          class="nearby-places-ranking-modal__leaderboard-tab"
                          :class="{ 'nearby-places-ranking-modal__leaderboard-tab--active': activeLeaderboardTab === 'departments' }"
                          :aria-selected="activeLeaderboardTab === 'departments'"
                          :aria-controls="leaderboardPanelId(category, 'departments')"
                          @click.stop="selectLeaderboardTab(category, 'departments')"
                        >{{ t("nearbyStations.placesRanking.departmentLeaderboardTitle") }}</button>
                      </div>
                      <div class="nearby-places-ranking-modal__leaderboard-viewport">
                        <div
                          class="nearby-places-ranking-modal__leaderboard-track"
                          :class="{ 'nearby-places-ranking-modal__leaderboard-track--departments': activeLeaderboardTab === 'departments' }"
                        >
                          <section
                            :id="leaderboardPanelId(category, 'cities')"
                            class="nearby-places-ranking-modal__leaderboard-panel nearby-places-ranking-modal__leaderboard-panel--cities"
                            role="tabpanel"
                            :aria-hidden="activeLeaderboardTab !== 'cities'"
                            :aria-labelledby="leaderboardTabId(category, 'cities')"
                          >
                            <span
                              v-for="entry in cityLeaderboard(category)"
                              :key="entry.code"
                              class="nearby-places-ranking-modal__leaderboard-entry"
                              :class="{ 'nearby-places-ranking-modal__leaderboard-entry--current': entry.current }"
                            >
                              <span>{{ entry.name }}</span>
                              <small>
                                {{ entry.ratioPerThousand === undefined
                                  ? n(entry.placeCount)
                                  : t("nearbyStations.placesRanking.perThousand", { ratio: n(entry.ratioPerThousand, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) }) }}
                                · {{ t("nearbyStations.placesRanking.rank", { rank: entry.rank }) }}
                              </small>
                            </span>
                          </section>
                          <section
                            :id="leaderboardPanelId(category, 'departments')"
                            class="nearby-places-ranking-modal__leaderboard-panel nearby-places-ranking-modal__leaderboard-panel--departments"
                            role="tabpanel"
                            :aria-hidden="activeLeaderboardTab !== 'departments'"
                            :aria-labelledby="leaderboardTabId(category, 'departments')"
                          >
                            <span
                              v-for="entry in departmentLeaderboard(category)"
                              :key="entry.departmentCode"
                              class="nearby-places-ranking-modal__leaderboard-entry"
                              :class="{ 'nearby-places-ranking-modal__leaderboard-entry--current': entry.departmentCode === cityRanking.departmentCode }"
                            >
                              <span>{{ t("nearbyStations.placesRanking.departmentLabel", { department: entry.departmentCode }) }}</span>
                              <small>
                                {{ entry.ratioPerThousand === undefined
                                  ? n(entry.placeCount)
                                  : t("nearbyStations.placesRanking.perThousand", { ratio: n(entry.ratioPerThousand, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) }) }}
                                · {{ t("nearbyStations.placesRanking.rank", { rank: entry.rank }) }}
                              </small>
                            </span>
                          </section>
                        </div>
                      </div>
                    </span>
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>
        <div v-else class="nearby-places-ranking-modal__state" role="status">
          <span>{{ t("nearbyStations.placesRanking.noCity") }}</span>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.nearby-places-ranking-modal {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: grid;
  place-items: center;
  padding: 18px;
}
.nearby-places-ranking-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, .72);
  backdrop-filter: blur(6px);
}
.nearby-places-ranking-modal__panel {
  position: relative;
  display: grid;
  align-content: start;
  gap: 22px;
  width: min(720px, 100%);
  max-height: min(820px, calc(100vh - 36px));
  overflow: auto;
  padding: clamp(22px, 4vw, 38px);
  border: 1px solid rgba(129, 140, 248, .32);
  border-radius: 24px;
  background: linear-gradient(145deg, #111936, #1e2750 65%, #283463);
  box-shadow: 0 28px 80px rgba(2, 6, 23, .48);
  color: #fff;
}
.nearby-places-ranking-modal__content {
  display: grid;
  gap: 14px;
}
.nearby-places-ranking-modal__scope-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(165, 180, 252, .2);
  border-radius: 11px;
  background: rgba(2, 6, 23, .3);
}
.nearby-places-ranking-modal__scope-option {
  flex: 1 1 145px;
  min-height: 34px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  font: inherit;
  font-size: .72rem;
  font-weight: 850;
  line-height: 1.2;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
.nearby-places-ranking-modal__scope-option:hover,
.nearby-places-ranking-modal__scope-option:focus-visible {
  background: rgba(255, 255, 255, .1);
  color: #fff;
  outline: 2px solid rgba(191, 219, 254, .65);
  outline-offset: 1px;
  transform: none;
}
.nearby-places-ranking-modal__scope-option--active {
  background: #e0e7ff;
  color: #172554;
  box-shadow: 0 2px 8px rgba(2, 6, 23, .24);
}
.nearby-places-ranking-modal__scope-option--active:hover,
.nearby-places-ranking-modal__scope-option--active:focus-visible {
  background: #e0e7ff;
  color: #172554;
}
.nearby-places-ranking-modal__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
}
.nearby-places-ranking-modal__eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  color: #a5b4fc;
  font-size: .68rem;
  font-weight: 900;
  letter-spacing: .13em;
  text-transform: uppercase;
}
.nearby-places-ranking-modal h2 {
  margin: 0;
  font-size: clamp(1.45rem, 4vw, 2.1rem);
  line-height: 1.05;
  color: #fff !important;
}
.nearby-places-ranking-modal__city {
  margin: 8px 0 0;
  color: #c7d2fe;
  font-size: .88rem;
  font-weight: 750;
}
.nearby-places-ranking-modal__close,
.nearby-places-ranking-modal__retry {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  cursor: pointer;
}
.nearby-places-ranking-modal__close {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 12px;
  background: rgba(255, 255, 255, .08);
  color: #fff !important;
}
.nearby-places-ranking-modal__close:hover,
.nearby-places-ranking-modal__close:focus-visible {
  background: rgba(255, 255, 255, .17);
  color: #fff !important;
  outline: 2px solid rgba(191, 219, 254, .65);
  outline-offset: 1px;
  transform: none;
}
.nearby-places-ranking-modal__intro {
  margin: 0;
  color: #cbd5e1;
  font-size: .82rem;
  line-height: 1.5;
}
.nearby-places-ranking-modal__rows { display: grid; gap: 14px; }
.nearby-places-ranking-modal__row {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(165, 180, 252, .18);
  border-radius: 14px;
  background: rgba(15, 23, 42, .34);
}
.nearby-places-ranking-modal__row-heading,
.nearby-places-ranking-modal__row-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.nearby-places-ranking-modal__row-heading strong { font-size: .9rem; }
.nearby-places-ranking-modal__row-heading span,
.nearby-places-ranking-modal__row-meta { color: #cbd5e1; font-size: .72rem; }
.nearby-places-ranking-modal__row-meta b { color: #a7f3d0; font-size: .76rem; }
.nearby-places-ranking-modal__ratio-label { color: #bfdbfe !important; font-size: .72rem !important; }
.nearby-places-ranking-modal__scope-meta { align-items: flex-end; display: flex; flex-wrap: wrap; gap: 5px 9px; justify-content: flex-end; }
.nearby-places-ranking-modal__scope-label { color: #bfdbfe !important; }
.nearby-places-ranking-modal__leaderboard { position: relative; }
.nearby-places-ranking-modal__leaderboard-trigger { background: transparent; border: 0; border-bottom: 1px dotted rgba(255, 255, 255, .6); color: #fef3c7; cursor: help; font: inherit; font-size: .71rem; padding: 1px 0; }
.nearby-places-ranking-modal__leaderboard-trigger:hover,.nearby-places-ranking-modal__leaderboard-trigger:focus-visible { border-bottom-color: #fff; color: #fff; outline: 0; }
.nearby-places-ranking-modal__leaderboard-tooltip { background: #0f1730; border: 1px solid rgba(165, 180, 252, .35); border-radius: 11px; bottom: calc(100% + 8px); box-shadow: 0 12px 26px rgba(2, 6, 23, .4); display: grid; gap: 8px; min-width: min(290px, calc(100vw - 36px)); outline: 0; padding: 9px; position: absolute; right: 0; width: min(320px, calc(100vw - 36px)); z-index: 5; }
.nearby-places-ranking-modal__leaderboard-tabs { background: rgba(129, 140, 248, .14); border-radius: 8px; display: grid; gap: 3px; grid-template-columns: 1fr 1fr; padding: 3px; }
.nearby-places-ranking-modal__leaderboard-tab { border: 0; border-radius: 6px; background: transparent; color: #cbd5e1; cursor: pointer; font: inherit; font-size: .64rem; font-weight: 800; line-height: 1.2; min-height: 28px; padding: 5px 6px; }
.nearby-places-ranking-modal__leaderboard-tab:hover,.nearby-places-ranking-modal__leaderboard-tab:focus-visible { color: #fff; outline: 0; }
.nearby-places-ranking-modal__leaderboard-tab--active { background: #e0e7ff; color: #172554; box-shadow: 0 2px 8px rgba(2, 6, 23, .22); }
.nearby-places-ranking-modal__leaderboard-viewport { overflow: hidden; }
.nearby-places-ranking-modal__leaderboard-track { display: flex; width: 200%; transition: transform 220ms ease; transform: translateX(0); }
.nearby-places-ranking-modal__leaderboard-track--departments { transform: translateX(-50%); }
.nearby-places-ranking-modal__leaderboard-panel { align-content: start; display: grid; flex: 0 0 50%; gap: 5px; min-width: 0; }
.nearby-places-ranking-modal__leaderboard-entry { align-items: center; border-radius: 6px; display: flex; font-size: .68rem; gap: 8px; justify-content: space-between; min-width: 0; padding: 3px 4px; }
.nearby-places-ranking-modal__leaderboard-entry > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-places-ranking-modal__leaderboard-entry--current { background: rgba(52, 211, 153, .16); color: #ecfdf5; }
.nearby-places-ranking-modal__leaderboard-entry small { color: #cbd5e1; flex: 0 0 auto; font-size: .63rem; }
.nearby-places-ranking-modal__bar-track { height: 14px; overflow: hidden; border-radius: 999px; background: rgba(2, 6, 23, .62); box-shadow: inset 0 1px 3px rgba(0, 0, 0, .35); }
.nearby-places-ranking-modal__bar-fill { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: linear-gradient(90deg, #34d399, #a3e635 55%, #fde047); box-shadow: 0 0 13px rgba(74, 222, 128, .48); }
.nearby-places-ranking-modal__state { display: grid; justify-items: center; gap: 10px; padding: 34px 10px; color: #cbd5e1; text-align: center; }
.nearby-places-ranking-modal__state--error { color: #fecaca; }
.nearby-places-ranking-modal__state--error strong { color: #fff; }
.nearby-places-ranking-modal__retry { gap: 7px; padding: 9px 13px; border: 1px solid rgba(255, 255, 255, .22); border-radius: 9px; background: rgba(255, 255, 255, .08); color: #fff; font-weight: 800; }
.nearby-places-ranking-modal__retry:hover { background: rgba(255, 255, 255, .16); }
.nearby-places-ranking-modal__spin { animation: nearby-places-ranking-spin 900ms linear infinite; }
@keyframes nearby-places-ranking-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .nearby-places-ranking-modal__leaderboard-track { transition: none; }
  .nearby-places-ranking-modal__spin { animation: none; }
}
@media (max-width: 600px) {
  .nearby-places-ranking-modal { padding: 0; }
  .nearby-places-ranking-modal__panel { width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0; }
}
</style>
