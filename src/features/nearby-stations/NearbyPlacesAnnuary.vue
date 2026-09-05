<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Briefcase,
  Car,
  ChevronDown,
  Cross,
  Download,
  EllipsisVertical,
  ExternalLink,
  Film,
  Flower2,
  Footprints,
  Gamepad2,
  GraduationCap,
  Landmark,
  Laptop,
  RefreshCw,
  Search,
  Shirt,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  TreePine,
} from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { NearbyPlace } from "./nearbyPlaces";
import {
  NEARBY_DIRECTORY_WALKING_MINUTES,
  NEARBY_PLACE_TYPE_KEYS,
  countNearbyPlaces,
  filterAndGroupNearbyPlaces,
  nearbyPlaceGoogleMapsUrl,
  nearbyPlaceIsWithinWalkingMinutes,
  nearbyPlaceWalkingDistanceMeters,
  nearbyPlaceWalkingMinutes,
  nearbyPlaceTypeKey,
  normalizeNearbyPlaceText,
  walkingMinutesToMeters,
  type NearbyPlaceGroupId,
  type NearbyPlaceIconId,
  type NearbyWalkingMinutes,
} from "./nearbyPlacePresentation";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import type { NearbyWalkingLoadProgress } from "./useNearbyWalkingRoutes";
import { useNearbyPlacePresenter } from "./useNearbyPlacePresenter";
import NearbyWalkingProgressIndicator from "./NearbyWalkingProgressIndicator.vue";
import {
  buildNearbyPlacesExportHtml,
  nearbyPlacesExportPolicy,
  type NearbyPlacesExportItem,
  type NearbyPlacesExportPayload,
  type NearbyPlacesExportSection,
} from "./nearbyPlacesExport";

const props = defineProps<{
  places: readonly NearbyPlace[];
  walkingMinutes: NearbyWalkingMinutes;
  originCity?: string;
  query?: string;
  selectedPlaceId?: string;
  preserveSelectedPlaceOutsideRadius?: boolean;
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
  walkingProgress?: Readonly<Record<string, NearbyWalkingLoadProgress | undefined>>;
  loadingGroupIds?: ReadonlySet<NearbyPlaceGroupId>;
  initialPreloadGroupCount?: number;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  "update:walkingMinutes": [value: NearbyWalkingMinutes];
  "update:visiblePlaces": [places: NearbyPlace[]];
  requestGroupWalkingRoutes: [groupId: NearbyPlaceGroupId, places: NearbyPlace[]];
  placeContextMenu: [placeId: string, anchor: HTMLElement];
  selectPlace: [placeId?: string];
  retry: [];
}>();

const { t, locale } = useI18n();
const { presentPlace } = useNearbyPlacePresenter();
const expandedGroupIds = ref<Set<NearbyPlaceGroupId>>(new Set());
const expandedBeforeSearch = ref<Set<NearbyPlaceGroupId>>(new Set());
const hiddenSubcategoryKeys = ref<Set<string>>(new Set());
const filterPanelOpen = ref(false);
const filterPanelPinned = ref(false);
const moreActionsOpen = ref(false);
const moreActionsAnchor = ref<HTMLElement | null>(null);
const initialPreloadRequested = ref(false);
const requestedGroupSignatures = new Map<NearbyPlaceGroupId, string>();
let filterCloseTimer: number | undefined;

const radiusMeters = computed(() => walkingMinutesToMeters(props.walkingMinutes));
const baseGroups = computed(() => {
  const places = props.places.filter((place) =>
    nearbyPlaceIsWithinWalkingMinutes(
      place,
      props.walkingRoutes?.[place.id],
      props.walkingMinutes,
    )
    || (props.preserveSelectedPlaceOutsideRadius && props.selectedPlaceId === place.id),
  );

  return filterAndGroupNearbyPlaces({
  places,
  radiusMeters: radiusMeters.value,
  query: props.query ?? "",
  typeLabel: (place) => t(nearbyPlaceTypeKey(place)),
  groupLabel: (group) => t(group.labelKey),
  locale: locale.value,
  walkingDistance: (place) => props.walkingRoutes?.[place.id]?.distanceMeters,
  includePlaceIds: props.preserveSelectedPlaceOutsideRadius && props.selectedPlaceId
    ? new Set([props.selectedPlaceId])
    : undefined,
  });
});

interface SubcategoryOption {
  key: string;
  label: string;
  count: number;
}

const subcategoriesByGroup = computed(() => {
  const result = new Map<NearbyPlaceGroupId, SubcategoryOption[]>();
  for (const group of baseGroups.value) {
    const byKind = new Map<string, { place: NearbyPlace; count: number }>();
    for (const place of group.places) {
      const key = placeKindKey(place);
      const existing = byKind.get(key);
      if (existing) existing.count += 1;
      else byKind.set(key, { place, count: 1 });
    }
    result.set(group.id, [...byKind.entries()]
      .map(([key, value]) => ({ key, label: subcategoryLabel(value.place), count: value.count }))
      .sort((left, right) => left.label.localeCompare(right.label, locale.value)));
  }
  return result;
});

const groups = computed(() => baseGroups.value.map((group) => ({
  ...group,
  places: group.places.filter((place) => isPlaceKindVisible(group.id, place)),
})).filter((group) => group.places.length > 0));
const visiblePlaces = computed(() => groups.value.flatMap((group) => group.places));
const visiblePlaceCounts = computed(() => countNearbyPlaces(visiblePlaces.value));

const iconComponents: Readonly<Record<NearbyPlaceIconId, unknown>> = {
  basket: ShoppingCart,
  utensils: Utensils,
  health: Cross,
  education: GraduationCap,
  "tree-pine": TreePine,
  shirt: Shirt,
  "home-garden": Flower2,
  toys: Gamepad2,
  car: Car,
  "home-tech": Laptop,
  briefcase: Briefcase,
  culture: Film,
  landmark: Landmark,
  sparkles: Sparkles,
};

function groupIcon(group: { icon: NearbyPlaceIconId }) {
  return iconComponents[group.icon] ?? Sparkles;
}

function placeIcon(place: NearbyPlace) {
  return presentPlace(place).icon;
}

function subcategoryLabel(place: NearbyPlace): string {
  const key = placeKindKey(place);
  const translatedKey = NEARBY_PLACE_TYPE_KEYS[key];
  if (translatedKey) return t(translatedKey);
  if (place.kind.trim()) {
    return place.kind
      .replace(/[_-]+/gu, " ")
      .replace(/\b\p{Letter}/gu, (letter) => letter.toLocaleUpperCase(locale.value));
  }
  return t(nearbyPlaceTypeKey(place));
}

function groupSubcategories(groupId: NearbyPlaceGroupId): SubcategoryOption[] {
  return subcategoriesByGroup.value.get(groupId) ?? [];
}

function placeKindKey(place: NearbyPlace): string {
  return normalizeNearbyPlaceText(place.kind).replace(/\s+/gu, "_") || place.category;
}

function isPlaceKindVisible(groupId: NearbyPlaceGroupId, place: NearbyPlace): boolean {
  return !hiddenSubcategoryKeys.value.has(subcategoryFilterKey(groupId, placeKindKey(place)));
}

function subcategoryFilterKey(groupId: NearbyPlaceGroupId, key: string): string {
  return `${groupId}:${key}`;
}

function toggleSubcategory(groupId: NearbyPlaceGroupId, key: string): void {
  const next = new Set(hiddenSubcategoryKeys.value);
  const filterKey = subcategoryFilterKey(groupId, key);
  if (next.has(filterKey)) next.delete(filterKey);
  else next.add(filterKey);
  hiddenSubcategoryKeys.value = next;
}

function isSubcategorySelected(groupId: NearbyPlaceGroupId, key: string): boolean {
  return !hiddenSubcategoryKeys.value.has(subcategoryFilterKey(groupId, key));
}

function resetSubcategories(): void {
  hiddenSubcategoryKeys.value = new Set();
}

function isGroupExpanded(groupId: NearbyPlaceGroupId): boolean {
  return expandedGroupIds.value.has(groupId);
}

function toggleGroup(groupId: NearbyPlaceGroupId): void {
  const next = new Set(expandedGroupIds.value);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  expandedGroupIds.value = next;
}

function requestGroupWalkingRoutes(groupId: NearbyPlaceGroupId): void {
  const group = baseGroups.value.find((candidate) => candidate.id === groupId);
  if (!group || group.places.length === 0) return;
  const signature = group.places.map((place) => place.id).sort().join("\u001f");
  if (requestedGroupSignatures.get(group.id) === signature) return;
  requestedGroupSignatures.set(group.id, signature);
  emit("requestGroupWalkingRoutes", group.id, [...group.places]);
}

function openFilterPanel(): void {
  if (filterCloseTimer !== undefined) window.clearTimeout(filterCloseTimer);
  filterPanelOpen.value = true;
}

function toggleFilterPanel(): void {
  if (filterPanelOpen.value && filterPanelPinned.value) {
    filterPanelPinned.value = false;
    scheduleFilterPanelClose();
    return;
  }
  openFilterPanel();
  filterPanelPinned.value = true;
}

function scheduleFilterPanelClose(): void {
  if (filterPanelPinned.value) return;
  if (filterCloseTimer !== undefined) window.clearTimeout(filterCloseTimer);
  filterCloseTimer = window.setTimeout(() => {
    if (!filterPanelPinned.value) filterPanelOpen.value = false;
  }, 180);
}

function keepFilterPanelOpen(): void {
  if (filterCloseTimer !== undefined) window.clearTimeout(filterCloseTimer);
  filterPanelOpen.value = true;
}

function closeFilterPanelIfAllowed(): void {
  scheduleFilterPanelClose();
}

function toggleMoreActions(): void {
  moreActionsOpen.value = !moreActionsOpen.value;
}

function closeMoreActions(): void {
  moreActionsOpen.value = false;
}

function exportFromMoreActions(): void {
  closeMoreActions();
  exportDirectoryHtml();
}

function handleMoreActionsDocumentClick(event: MouseEvent): void {
  const target = event.target;
  if (moreActionsAnchor.value && target instanceof Node && moreActionsAnchor.value.contains(target)) return;
  closeMoreActions();
}

function handleMoreActionsKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeMoreActions();
}

function isGroupLoading(groupId: NearbyPlaceGroupId): boolean {
  return props.loadingGroupIds?.has(groupId) ?? false;
}

function groupWalkingProgress(groupId: NearbyPlaceGroupId): NearbyWalkingLoadProgress | undefined {
  return props.walkingProgress?.[groupId];
}

function isGroupProgressComplete(groupId: NearbyPlaceGroupId): boolean {
  const progress = groupWalkingProgress(groupId);
  return Boolean(progress && progress.total > 0 && progress.completed >= progress.total && !isGroupLoading(groupId));
}

function groupProgressLabel(groupId: NearbyPlaceGroupId): string {
  return isGroupProgressComplete(groupId)
    ? t("nearbyStations.directory.walkingLoadCompleted")
    : t("nearbyStations.directory.loading");
}

function placeRoute(place: NearbyPlace): NearbyWalkingRoute | undefined {
  return props.walkingRoutes?.[place.id];
}

function placeDistanceMeters(place: NearbyPlace): number {
  return nearbyPlaceWalkingDistanceMeters(place, placeRoute(place));
}

function placeWalkingMinutes(place: NearbyPlace): number {
  return nearbyPlaceWalkingMinutes(place, placeRoute(place));
}

function placeMetadata(place: NearbyPlace): string {
  return [
    t(nearbyPlaceTypeKey(place)),
    place.address,
    t("nearbyStations.directory.distance", { meters: placeDistanceMeters(place) }),
  ].filter(Boolean).join(" · ");
}

function placeAriaLabel(place: NearbyPlace): string {
  return t("nearbyStations.directory.selectPlace", {
    name: place.name,
    minutes: placeWalkingMinutes(place),
    metadata: placeMetadata(place),
  });
}

function openPlaceContextMenu(placeId: string, event: MouseEvent): void {
  const anchor = event.currentTarget;
  if (anchor instanceof HTMLElement) emit("placeContextMenu", placeId, anchor);
}

function exportPayload(): NearbyPlacesExportPayload {
  const exportWalkingMinutes: NearbyWalkingMinutes = props.walkingMinutes === 5 ? 5 : 10;
  const exportPlaces = props.places.filter((place) =>
    nearbyPlaceWalkingDistanceMeters(place, placeRoute(place)) <= nearbyPlacesExportPolicy.maxRadiusMeters,
  );
  const exportPlaceIds = new Set(exportPlaces.map((place) => place.id));
  const exportWalkingRoutes = props.walkingRoutes
    ? Object.fromEntries(
        Object.entries(props.walkingRoutes).filter(([placeId]) => exportPlaceIds.has(placeId)),
      )
    : undefined;

  return {
    places: exportPlaces,
    walkingMinutes: exportWalkingMinutes,
    originCity: props.originCity,
    query: props.query,
    selectedPlaceId: props.selectedPlaceId && exportPlaceIds.has(props.selectedPlaceId)
      ? props.selectedPlaceId
      : undefined,
    preserveSelectedPlaceOutsideRadius: props.preserveSelectedPlaceOutsideRadius,
    walkingRoutes: exportWalkingRoutes,
    walkingProgress: props.walkingProgress,
    loadingGroupIds: props.loadingGroupIds ? [...props.loadingGroupIds] : undefined,
    initialPreloadGroupCount: props.initialPreloadGroupCount,
    loading: props.loading,
    error: props.error,
  };
}

function exportSections(
  payload: NearbyPlacesExportPayload,
  radiusMinutes: NearbyWalkingMinutes = nearbyPlacesExportPolicy.maxMinutes,
): NearbyPlacesExportSection[] {
  const places = payload.places.filter((place) =>
    nearbyPlaceWalkingDistanceMeters(place, payload.walkingRoutes?.[place.id]) <= walkingMinutesToMeters(radiusMinutes),
  );
  const groups = filterAndGroupNearbyPlaces({
    places,
    radiusMeters: walkingMinutesToMeters(radiusMinutes),
    query: "",
    typeLabel: (place) => t(nearbyPlaceTypeKey(place)),
    groupLabel: (group) => t(group.labelKey),
    locale: locale.value,
    walkingDistance: (place) => payload.walkingRoutes?.[place.id]?.distanceMeters,
  });

  return groups.map((group) => ({
    id: group.id,
    label: t(group.labelKey),
    icon: group.icon,
    tone: group.tone,
    // The exported directory is a reference board: show every card immediately.
    // The accordion controls remain available to collapse individual categories.
    expanded: true,
    places: group.places.map<NearbyPlacesExportItem>((place) => {
      const route = payload.walkingRoutes?.[place.id];
      return {
        id: place.id,
        name: place.name,
        type: subcategoryLabel(place),
        address: place.address,
        distanceMeters: nearbyPlaceWalkingDistanceMeters(place, route),
        walkingMinutes: nearbyPlaceWalkingMinutes(place, route),
        walkingTime: t("nearbyStations.walkingTime", { minutes: nearbyPlaceWalkingMinutes(place, route) }),
        googleMapsUrl: nearbyPlaceGoogleMapsUrl(place, { city: props.originCity }),
        selected: props.selectedPlaceId === place.id,
        commerce: place.category === "shop",
      };
    }),
  }));
}

function exportDirectoryHtml(): void {
  const payload = exportPayload();
  const sections = exportSections(payload, nearbyPlacesExportPolicy.maxMinutes);
  const activeExportPlaces = payload.places.filter((place) =>
    nearbyPlaceWalkingDistanceMeters(place, payload.walkingRoutes?.[place.id])
      <= walkingMinutesToMeters(payload.walkingMinutes),
  );
  const activeExportPlaceCounts = countNearbyPlaces(activeExportPlaces);
  const html = buildNearbyPlacesExportHtml({
    locale: locale.value,
    eyebrow: t("nearbyStations.directory.eyebrow"),
    title: t("nearbyStations.directory.title"),
    searchLabel: t("nearbyStations.directory.searchLabel"),
    searchPlaceholder: t("nearbyStations.directory.searchPlaceholder"),
    summary: t("nearbyStations.directory.summary", {
      total: activeExportPlaceCounts.total,
      commerce: activeExportPlaceCounts.commerce,
      minutes: payload.walkingMinutes,
    }),
    summaryTemplate: t("nearbyStations.directory.summary", {
      total: "{total}",
      commerce: "{commerce}",
      minutes: "{minutes}",
    }),
    resultsLabel: t("nearbyStations.directory.resultsLabel"),
    loading: t("nearbyStations.directory.loading"),
    error: t("nearbyStations.directory.error"),
    noSubcategoryResults: t("nearbyStations.directory.noSubcategoryResults"),
    openInGoogleMaps: t("nearbyStations.directory.openInGoogleMaps"),
    radiusLabel: t("nearbyStations.directory.radiusLabel"),
    fiveMinutes: t("nearbyStations.directory.minutes", { minutes: 5 }),
    tenMinutes: t("nearbyStations.directory.minutes", { minutes: 10 }),
    fifteenMinutes: t("nearbyStations.directory.exportHtmlLockedMinutes"),
    premiumRequired: t("nearbyStations.directory.exportHtmlPremiumRequired"),
  }, payload, sections);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "transport-clock-nearby-directory.html";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

watch(visiblePlaces, (places) => emit("update:visiblePlaces", [...places]), { immediate: true });

watch(
  () => props.query ?? "",
  (next, previous) => {
    if (next.trim() && !previous.trim()) expandedBeforeSearch.value = new Set(expandedGroupIds.value);
    if (!next.trim() && previous.trim()) expandedGroupIds.value = new Set(expandedBeforeSearch.value);
  },
);

watch(groups, (nextGroups) => {
  if ((props.query ?? "").trim()) {
    expandedGroupIds.value = new Set(nextGroups.map((group) => group.id));
    return;
  }
  const available = new Set(nextGroups.map((group) => group.id));
  const kept = new Set([...expandedGroupIds.value].filter((id) => available.has(id)));
  if (kept.size === 0 && nextGroups[0]) kept.add(nextGroups[0].id);
  expandedGroupIds.value = kept;

  if (!initialPreloadRequested.value && nextGroups.length > 0) {
    initialPreloadRequested.value = true;
    const requestedCount = props.initialPreloadGroupCount;
    const count = requestedCount === undefined
      ? nextGroups.length
      : Math.max(0, Math.min(nextGroups.length, Math.floor(requestedCount)));
    for (const group of nextGroups.slice(0, count)) requestGroupWalkingRoutes(group.id);
  }
}, { immediate: true });

watch(expandedGroupIds, (next, previous) => {
  for (const groupId of next) {
    if (!previous?.has(groupId)) requestGroupWalkingRoutes(groupId);
  }
}, { deep: true, immediate: true });

watch(subcategoriesByGroup, (next) => {
  const available = new Set<string>();
  for (const [groupId, options] of next) {
    for (const option of options) available.add(subcategoryFilterKey(groupId, option.key));
  }
  hiddenSubcategoryKeys.value = new Set(
    [...hiddenSubcategoryKeys.value].filter((key) => available.has(key)),
  );
}, { immediate: true });

onMounted(() => {
  document.addEventListener("click", handleMoreActionsDocumentClick);
  document.addEventListener("keydown", handleMoreActionsKeydown);
});

onBeforeUnmount(() => {
  if (filterCloseTimer !== undefined) window.clearTimeout(filterCloseTimer);
  document.removeEventListener("click", handleMoreActionsDocumentClick);
  document.removeEventListener("keydown", handleMoreActionsKeydown);
});
</script>

<template>
  <div class="nearby-places-annuary">
    <div class="nearby-directory__toolbar">
      <p aria-live="polite">
        {{ t("nearbyStations.directory.summary", {
          total: visiblePlaceCounts.total,
          commerce: visiblePlaceCounts.commerce,
          minutes: walkingMinutes,
        }) }}
      </p>
      <div class="nearby-directory__toolbar-actions">
        <div ref="moreActionsAnchor" class="nearby-directory__more-actions">
          <button
            class="nearby-directory__more-trigger"
            type="button"
            :aria-label="t('nearbyStations.directory.moreActions')"
            :aria-expanded="moreActionsOpen"
            aria-haspopup="menu"
            :title="t('nearbyStations.directory.moreActions')"
            @click.stop="toggleMoreActions"
          >
            <EllipsisVertical :size="18" aria-hidden="true" />
          </button>
          <div v-if="moreActionsOpen" class="nearby-directory__more-menu" role="menu">
            <button
              class="nearby-directory__export-trigger nearby-directory__more-menu-item"
              type="button"
              role="menuitem"
              :aria-label="t('nearbyStations.directory.exportHtmlTitle')"
              @click="exportFromMoreActions"
            >
              <Download :size="15" aria-hidden="true" />
              <span>{{ t("nearbyStations.directory.exportHtml") }}</span>
            </button>
          </div>
        </div>
        <div
          v-if="subcategoriesByGroup.size > 0"
          class="nearby-directory__filter-anchor"
          @mouseenter="openFilterPanel"
          @mouseleave="closeFilterPanelIfAllowed"
        >
          <button
            class="nearby-directory__filter-trigger"
            type="button"
            :aria-label="t('nearbyStations.directory.filterSubcategoriesTitle')"
            :aria-expanded="filterPanelOpen"
            @focus="openFilterPanel"
            @click="toggleFilterPanel"
          >
            <SlidersHorizontal :size="15" aria-hidden="true" />
            <span>{{ t("nearbyStations.directory.filterSubcategoriesTitle") }}</span>
          </button>
          <aside
            v-if="filterPanelOpen"
            class="nearby-directory__subcategory-panel nearby-directory__subcategory-panel--global"
            :aria-label="t('nearbyStations.directory.filterSubcategoriesTitle')"
            @mouseenter="keepFilterPanelOpen"
            @mouseleave="closeFilterPanelIfAllowed"
          >
            <header>
              <strong>{{ t("nearbyStations.directory.filterSubcategoriesTitle") }}</strong>
              <button type="button" @click="resetSubcategories">{{ t("nearbyStations.directory.resetSubcategories") }}</button>
            </header>
            <section v-for="group in baseGroups" :key="group.id" class="nearby-directory__subcategory-section">
              <h4>{{ t(group.labelKey) }}</h4>
              <label v-for="subcategory in groupSubcategories(group.id)" :key="subcategory.key">
                <input
                  type="checkbox"
                  :checked="isSubcategorySelected(group.id, subcategory.key)"
                  @change="toggleSubcategory(group.id, subcategory.key)"
                />
                <span>{{ subcategory.label }}</span>
                <small>{{ subcategory.count }}</small>
              </label>
            </section>
          </aside>
        </div>
        <div class="nearby-directory__radius" role="group" :aria-label="t('nearbyStations.directory.radiusLabel')">
          <Footprints :size="17" aria-hidden="true" />
          <button
            v-for="minutes in NEARBY_DIRECTORY_WALKING_MINUTES"
            :key="minutes"
            type="button"
            :aria-pressed="walkingMinutes === minutes"
            :class="{ 'nearby-directory__radius-button--active': walkingMinutes === minutes }"
            @click="emit('update:walkingMinutes', minutes)"
          >
            {{ t("nearbyStations.directory.minutes", { minutes }) }}
          </button>
        </div>
      </div>
    </div>

    <section class="nearby-directory__results" :aria-label="t('nearbyStations.directory.resultsLabel')">
      <div v-if="loading" class="nearby-directory__state" role="status">
        <strong>{{ t("nearbyStations.directory.loading") }}</strong>
      </div>
      <div v-else-if="error" class="nearby-directory__state nearby-directory__state--error" role="alert">
        <strong>{{ t("nearbyStations.directory.error") }}</strong>
        <button type="button" @click="emit('retry')"><RefreshCw :size="15" aria-hidden="true" />{{ t("common.actions.retry") }}</button>
      </div>
      <div v-else-if="groups.length === 0" class="nearby-directory__state">
        <Search :size="28" aria-hidden="true" />
        <strong>{{ t("nearbyStations.directory.emptyTitle") }}</strong>
        <span>{{ t("nearbyStations.directory.emptyBody") }}</span>
      </div>
      <div v-else class="nearby-directory__groups">
        <article
          v-for="group in groups"
          :key="group.id"
          class="nearby-directory__group"
          :class="`nearby-directory__group--${group.tone}`"
        >
          <h3>
            <button
              type="button"
              :aria-expanded="isGroupExpanded(group.id)"
              :aria-controls="`nearby-directory-group-${group.id}`"
              @click="toggleGroup(group.id)"
            >
              <span class="nearby-directory__group-icon"><component :is="groupIcon(group)" :size="18" aria-hidden="true" /></span>
              <span class="nearby-directory__group-title">{{ t(group.labelKey) }}</span>
              <NearbyWalkingProgressIndicator
                :active="isGroupLoading(group.id)"
                :complete="isGroupProgressComplete(group.id)"
                :label="groupProgressLabel(group.id)"
              />
              <span class="nearby-directory__group-count">{{ group.places.length }}</span>
              <ChevronDown class="nearby-directory__chevron" :size="19" aria-hidden="true" />
            </button>
          </h3>
          <div
            :id="`nearby-directory-group-${group.id}`"
            class="nearby-directory__accordion"
            :class="{ 'nearby-directory__accordion--open': isGroupExpanded(group.id) }"
          >
            <div>
              <div v-if="group.places.length" class="nearby-directory__place-grid">
                <div
                  v-for="place in group.places"
                  :key="place.id"
                  class="nearby-directory__place-row"
                  @contextmenu.stop.prevent="openPlaceContextMenu(place.id, $event)"
                >
                  <button
                    class="nearby-directory__place"
                    :class="{ 'nearby-directory__place--selected': selectedPlaceId === place.id }"
                    :data-place-id="place.id"
                    type="button"
                    :aria-current="selectedPlaceId === place.id ? 'true' : undefined"
                    :aria-label="placeAriaLabel(place)"
                    :title="placeMetadata(place)"
                    @click="emit('selectPlace', selectedPlaceId === place.id ? undefined : place.id)"
                  >
                    <span class="nearby-directory__place-icon"><component :is="placeIcon(place)" :size="16" aria-hidden="true" /></span>
                    <span class="nearby-directory__place-copy">
                      <strong>{{ place.name }}</strong>
                      <span>{{ placeMetadata(place) }}</span>
                    </span>
                    <span class="nearby-directory__place-walk"><Footprints :size="15" aria-hidden="true" />{{ t("nearbyStations.walkingTime", { minutes: placeWalkingMinutes(place) }) }}</span>
                  </button>
                  <a
                    class="nearby-directory__place-google"
                    :href="nearbyPlaceGoogleMapsUrl(place, { city: originCity })"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="t('nearbyStations.directory.openPlaceInGoogleMaps', { name: place.name, address: place.address ?? '' })"
                    :title="t('nearbyStations.directory.openInGoogleMaps')"
                    @click.stop
                  >
                    <ExternalLink :size="14" aria-hidden="true" />
                  </a>
                </div>
              </div>
              <p v-else class="nearby-directory__subcategory-empty">{{ t("nearbyStations.directory.noSubcategoryResults") }}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nearby-places-annuary { display: contents; }
.nearby-directory__toolbar { align-items: center; background: rgba(255,255,255,.84); border-bottom: 1px solid rgba(16,35,63,.08); display: flex; gap: 18px; grid-column: 1 / -1; grid-row: 1; justify-content: space-between; padding: 10px 20px; }
.nearby-directory__toolbar p { color: var(--muted); flex: 1 1 auto; font-size: .96rem; font-weight: 850; line-height: 1.25; margin: 0; }
.nearby-directory__toolbar-actions { align-items: center; display: flex; flex: 0 0 auto; gap: 8px; }
.nearby-directory__more-actions { position: relative; }
.nearby-directory__more-trigger { align-items: center; background: #fff; border: 1px solid rgba(81,70,255,.2); border-radius: 10px; color: #5146ff; display: inline-flex; justify-content: center; min-height: 34px; min-width: 34px; padding: 7px; }
.nearby-directory__more-trigger:hover,.nearby-directory__more-trigger:focus-visible,.nearby-directory__more-trigger[aria-expanded="true"] { background: #f1efff; outline: 0; }
.nearby-directory__more-menu { background: #fff; border: 1px solid rgba(16,35,63,.12); border-radius: 11px; box-shadow: 0 12px 28px rgba(16,35,63,.18); min-width: 190px; padding: 5px; position: absolute; right: 0; top: calc(100% + 7px); z-index: 35; }
.nearby-directory__more-menu-item { align-items: center; background: transparent; border: 0; border-radius: 8px; color: #5146ff; display: flex; font-size: .72rem; font-weight: 850; gap: 7px; min-height: 34px; padding: 6px 9px; text-align: left; width: 100%; }
.nearby-directory__more-menu-item:hover,.nearby-directory__more-menu-item:focus-visible { background: #f1efff; outline: 0; }
.nearby-directory__filter-anchor { position: relative; }
.nearby-directory__filter-trigger { align-items: center; background: #fff; border: 1px solid rgba(81,70,255,.2); border-radius: 10px; color: #5146ff; display: inline-flex; font-size: .72rem; font-weight: 850; gap: 6px; min-height: 34px; padding: 6px 10px; white-space: nowrap; }
.nearby-directory__filter-trigger:hover,.nearby-directory__filter-trigger:focus-visible,.nearby-directory__export-trigger:hover,.nearby-directory__export-trigger:focus-visible { background: #f1efff; outline: 0; }
.nearby-directory__export-trigger { align-items: center; background: #fff; border: 1px solid rgba(81,70,255,.2); border-radius: 10px; color: #5146ff; display: inline-flex; font-size: .72rem; font-weight: 850; gap: 6px; min-height: 34px; padding: 6px 10px; white-space: nowrap; }
.nearby-directory__radius { align-items: center; background: #f1efff; border-radius: 11px; color: #5146ff; display: flex; gap: 3px; padding: 4px; }
.nearby-directory__radius > svg { margin: 0 5px; }
.nearby-directory__radius button { background: transparent; border-radius: 8px; color: #5e6480; font-size: .72rem; min-height: 32px; padding: 6px 9px; }
.nearby-directory__radius button.nearby-directory__radius-button--active { background: #5146ff; box-shadow: 0 3px 9px rgba(81,70,255,.24); color: #fff; }
.nearby-directory__results { background: #fff; border: 1px solid rgba(16,35,63,.1); border-radius: 16px; box-shadow: 0 8px 24px rgba(16,35,63,.05); grid-column: 3; grid-row: 2; justify-self: stretch; min-height: 0; overflow: auto; overflow-y: auto; scrollbar-color: rgba(81,70,255,.48) rgba(241,239,255,.72); scrollbar-gutter: stable; scrollbar-width: thin; width: 100%; }
.nearby-directory__results::-webkit-scrollbar { height: 9px; width: 9px; }
.nearby-directory__results::-webkit-scrollbar-track { background: #f1efff; border-radius: 999px; margin: 10px 2px; }
.nearby-directory__results::-webkit-scrollbar-thumb { background: #b8b2ff; border: 2px solid #f1efff; border-radius: 999px; min-height: 34px; }
.nearby-directory__results::-webkit-scrollbar-thumb:hover { background: #5146ff; }
.nearby-directory__groups { display: grid; gap: 7px; padding: 10px; }
.nearby-directory__group { --directory-tone:#64748b; border: 1px solid rgba(16,35,63,.09); border-radius: 12px; position: relative; }
.nearby-directory__group--green { --directory-tone:#17864c; }.nearby-directory__group--orange { --directory-tone:#e16919; }.nearby-directory__group--teal { --directory-tone:#0f8e8a; }.nearby-directory__group--pink { --directory-tone:#cf3d78; }.nearby-directory__group--blue { --directory-tone:#2474c8; }.nearby-directory__group--indigo { --directory-tone:#5146ff; }.nearby-directory__group--purple { --directory-tone:#7c3db5; }.nearby-directory__group--amber { --directory-tone:#b77910; }.nearby-directory__group--brown { --directory-tone:#9a5a22; }.nearby-directory__group--violet { --directory-tone:#8147bd; }.nearby-directory__group--red { --directory-tone:#c23a45; }
.nearby-directory__group h3 { margin: 0; position: relative; }
.nearby-directory__group h3 > button:first-child { align-items: center; background: #fff; border-radius: 12px 12px 0 0; color: var(--ink); display: grid; gap: 10px; grid-template-columns: 34px minmax(0,1fr) 24px auto 24px; min-height: 50px; padding: 7px 12px; text-align: left; width: 100%; }
.nearby-directory__group h3 > button:first-child:hover,.nearby-directory__group h3 > button:first-child:focus-visible { background: #fafaff; outline: 0; }
.nearby-directory__group-icon,.nearby-directory__place-icon { align-items: center; background: color-mix(in srgb,var(--directory-tone) 12%,white); border-radius: 50%; color: var(--directory-tone); display: flex; height: 32px; justify-content: center; width: 32px; }
.nearby-directory__group-title { font-size: .88rem; font-weight: 900; }
.nearby-directory__group-count { background: color-mix(in srgb,var(--directory-tone) 10%,white); border-radius: 999px; color: var(--directory-tone); font-size: .68rem; font-weight: 900; min-width: 25px; padding: 3px 7px; text-align: center; }
.nearby-directory__chevron { color: var(--directory-tone); transition: transform 220ms ease; }
[aria-expanded="true"] > .nearby-directory__chevron { transform: rotate(180deg); }
.nearby-directory__subcategory-panel { background: #fff; border: 1px solid rgba(81,70,255,.2); border-radius: 11px; box-shadow: 0 14px 30px rgba(16,35,63,.2); display: grid; gap: 7px; min-width: 220px; padding: 10px; position: absolute; right: 0; top: calc(100% + 7px); z-index: 30; }
.nearby-directory__subcategory-panel--global { grid-template-columns: repeat(2,minmax(0,1fr)); max-height: min(62vh,480px); min-width: 420px; overflow: auto; }
.nearby-directory__subcategory-panel header { align-items: center; border-bottom: 1px solid rgba(16,35,63,.09); display: flex; gap: 8px; justify-content: space-between; padding-bottom: 7px; }
.nearby-directory__subcategory-panel--global > header { grid-column: 1 / -1; }
.nearby-directory__subcategory-panel header strong { color: var(--ink); font-size: .7rem; }
.nearby-directory__subcategory-panel header button { background: transparent; color: #5146ff; font-size: .62rem; font-weight: 850; padding: 2px; }
.nearby-directory__subcategory-section { border-bottom: 1px solid rgba(16,35,63,.08); display: grid; gap: 7px; min-width: 0; padding: 2px 0 8px; }
.nearby-directory__subcategory-section:last-child { border-bottom: 0; padding-bottom: 0; }
.nearby-directory__subcategory-section h4 { color: var(--ink); font-size: .68rem; margin: 2px 0 0; }
.nearby-directory__subcategory-panel label { align-items: center; color: #334155; display: grid; font-size: .7rem; gap: 7px; grid-template-columns: 18px minmax(0,1fr) auto; }
.nearby-directory__subcategory-panel input { accent-color: #5146ff; height: 17px; margin: 0; width: 17px; }
.nearby-directory__subcategory-panel small { color: #64748b; font-size: .62rem; }
.nearby-directory__accordion { display: grid; grid-template-rows: 0fr; opacity: .25; transition: grid-template-rows 220ms ease,opacity 180ms ease; }
.nearby-directory__accordion > div { min-height: 0; overflow: hidden; }
.nearby-directory__accordion--open { grid-template-rows: 1fr; opacity: 1; }
.nearby-directory__place-grid { border-top: 1px solid rgba(16,35,63,.08); column-gap: 6px; display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,300px),1fr)); padding: 3px 8px 8px; }
.nearby-directory__place-row { align-items: center; border-bottom: 1px solid rgba(16,35,63,.07); display: grid; grid-template-columns: minmax(0,1fr) 28px; min-width: 0; }
.nearby-directory__place { align-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--ink); display: grid; gap: 8px; grid-template-columns: 30px minmax(0,1fr) auto; min-height: 52px; padding: 7px 8px; text-align: left; width: 100%; }
.nearby-directory__place-row:last-child { border-bottom-color: transparent; }
.nearby-directory__place:hover,.nearby-directory__place:focus-visible { background: #f8f7ff; outline: 0; }
.nearby-directory__place--selected { background: #eeecff; box-shadow: inset 0 0 0 1px rgba(81,70,255,.35); }
.nearby-directory__place-copy { display: grid; gap: 2px; min-width: 0; }
.nearby-directory__place-copy strong { font-size: .77rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-directory__place-copy > span { color: #8b91a7; font-size: .61rem; max-height: 0; opacity: 0; overflow: hidden; text-overflow: ellipsis; transition: max-height 160ms ease,opacity 160ms ease; white-space: nowrap; }
.nearby-directory__place:hover .nearby-directory__place-copy > span,.nearby-directory__place:focus-visible .nearby-directory__place-copy > span,.nearby-directory__place--selected .nearby-directory__place-copy > span { max-height: 18px; opacity: 1; }
.nearby-directory__place-walk { align-items: center; color: #5146ff; display: inline-flex; font-size: .62rem; font-weight: 850; gap: 3px; white-space: nowrap; }
.nearby-directory__place-google { align-items: center; border-radius: 7px; color: #64748b; display: inline-flex; height: 26px; justify-content: center; width: 26px; }
.nearby-directory__place-google:hover,.nearby-directory__place-google:focus-visible { background: #eeecff; color: #4034df; outline: 0; }
.nearby-directory__subcategory-empty { border-top: 1px solid rgba(16,35,63,.08); color: #64748b; font-size: .7rem; margin: 0; padding: 12px; }
.nearby-directory__state { align-items: center; color: var(--muted); display: flex; flex-direction: column; gap: 8px; justify-content: center; min-height: 320px; padding: 30px; text-align: center; }.nearby-directory__state strong { color: var(--ink); }.nearby-directory__state span { font-size: .8rem; }
.nearby-directory__state button { align-items: center; display: inline-flex; gap: 6px; }.nearby-directory__state--error { color: #b42318; }
@media (max-width:1179px) {
  .nearby-directory__place-row:last-child { border-bottom-color: transparent; }
}
@media (max-width:767px) {
  .nearby-directory__toolbar { align-items: stretch; flex-direction: column; gap: 8px; padding: 8px 12px; }.nearby-directory__toolbar p { text-align: center; }
  .nearby-directory__toolbar-actions { align-items: stretch; flex-direction: column; }.nearby-directory__more-actions { align-self: flex-end; }.nearby-directory__more-menu { max-width: calc(100vw - 32px); }.nearby-directory__filter-anchor { width: 100%; }.nearby-directory__filter-trigger { justify-content: center; width: 100%; }
  .nearby-directory__radius { justify-content: center; }.nearby-directory__radius button { flex: 1 1 0; }
  .nearby-directory__results { border-radius: 13px; grid-column: auto; overflow: visible; overflow-y: auto; scrollbar-gutter: stable; }.nearby-directory__groups { padding: 7px; }
  .nearby-directory__place-grid { grid-template-columns: 1fr; }
  .nearby-directory__place-copy > span { max-height: 18px; opacity: 1; }.nearby-directory__place { min-height: 58px; }
  .nearby-directory__subcategory-panel { left: 0; right: 0; }.nearby-directory__subcategory-panel--global { grid-template-columns: 1fr; max-height: 55vh; min-width: 0; }.nearby-directory__subcategory-panel--global > header { grid-column: auto; }
}
</style>
