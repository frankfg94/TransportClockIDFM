<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ChevronDown, Map as MapIcon, RotateCcw, Search, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { TransportMapBasemapStyle } from "../transport-map/basemap/tileMath";
import NearbyPlacesAnnuary from "./NearbyPlacesAnnuary.vue";
import NearbyStationsMap from "./NearbyStationsMap.vue";
import type { NearbyPlace } from "./nearbyPlaces";
import {
  nearbyPlaceIsWithinWalkingMinutes,
  walkingMinutesToMeters,
  type NearbyPlaceGroupId,
  type NearbyWalkingMinutes,
} from "./nearbyPlacePresentation";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import type { NearbyWalkingLoadProgress } from "./useNearbyWalkingRoutes";

const props = defineProps<{
  open: boolean;
  origin: { lon: number; lat: number; label?: string; city?: string };
  places: readonly NearbyPlace[];
  walkingMinutes: NearbyWalkingMinutes;
  selectedPlaceId?: string;
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
  walkingProgress?: Readonly<Record<string, NearbyWalkingLoadProgress | undefined>>;
  loadingGroupIds?: ReadonlySet<NearbyPlaceGroupId>;
  initialPreloadGroupCount?: number;
  loading?: boolean;
  error?: string;
  basemapStyle?: TransportMapBasemapStyle;
}>();

const emit = defineEmits<{
  close: [];
  retry: [];
  "update:walkingMinutes": [value: NearbyWalkingMinutes];
  placeContextMenu: [placeId: string, anchor: HTMLElement];
  requestGroupWalkingRoutes: [groupId: NearbyPlaceGroupId, places: NearbyPlace[]];
  selectPlace: [placeId?: string];
}>();

const { t } = useI18n();
const dialog = ref<HTMLElement>();
const layout = ref<HTMLElement>();
const splitter = ref<HTMLButtonElement>();
const searchInput = ref<HTMLInputElement>();
const mobileMapSection = ref<HTMLElement>();
const query = ref("");
const localSelectedPlaceId = ref<string>();
const directoryVisiblePlaces = ref<NearbyPlace[]>([]);
const mobileMapOpen = ref(false);
const mapRatio = ref(0.60);
const preserveSelectedPlaceOutsideRadius = ref(false);
const reducedMotion = ref(false);
let previousFocus: HTMLElement | null = null;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";
let previousScrollbarGutter = "";
const resizing = ref(false);
let resizeFrame: number | undefined;
let pendingMapRatio: number | undefined;
let resizeLayoutRect: DOMRect | undefined;

const radiusMeters = computed(() => walkingMinutesToMeters(props.walkingMinutes));
const selectedPlaceId = computed(() => localSelectedPlaceId.value);
const selectedPlace = computed(() => props.places.find((place) => place.id === selectedPlaceId.value));
const selectedWalkingRoute = computed(() => selectedPlaceId.value
  ? props.walkingRoutes?.[selectedPlaceId.value]
  : undefined);
const mapPlaces = computed(() => props.places.filter((place) => {
  return nearbyPlaceIsWithinWalkingMinutes(
    place,
    props.walkingRoutes?.[place.id],
    props.walkingMinutes,
  ) || place.id === selectedPlaceId.value;
}));
const layoutStyle = computed(() => ({
  "--nearby-directory-map-columns": `${mapRatio.value}fr`,
  "--nearby-directory-list-columns": `${1 - mapRatio.value}fr`,
}));

watch(() => props.selectedPlaceId, (value) => {
  localSelectedPlaceId.value = value;
}, { immediate: true });

watch(() => props.walkingMinutes, () => {
  preserveSelectedPlaceOutsideRadius.value = false;
});

function resetTransientState(): void {
  query.value = "";
  localSelectedPlaceId.value = props.selectedPlaceId;
  directoryVisiblePlaces.value = [];
  mobileMapOpen.value = false;
  preserveSelectedPlaceOutsideRadius.value = false;
}

function lockDocumentScroll(): void {
  previousHtmlOverflow = document.documentElement.style.overflow;
  previousBodyOverflow = document.body.style.overflow;
  previousScrollbarGutter = document.documentElement.style.scrollbarGutter;
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.scrollbarGutter = "stable";
  document.body.style.overflow = "hidden";
}

function restoreDocumentScroll(): void {
  document.documentElement.style.overflow = previousHtmlOverflow;
  document.documentElement.style.scrollbarGutter = previousScrollbarGutter;
  document.body.style.overflow = previousBodyOverflow;
}

function requestClose(): void {
  emit("close");
}

function handlePlaceContextMenu(placeId: string, anchor: HTMLElement): void {
  emit("placeContextMenu", placeId, anchor);
}

function clampMapRatio(value: number): number {
  return Math.min(0.8, Math.max(0.38, value));
}

function renderMapRatio(value: number): void {
  // Keep the drag on the browser's rendering path. Updating mapRatio here
  // would re-render both panes for every pointer sample.
  const normalized = clampMapRatio(value);
  const mapPercent = Math.round(normalized * 100);
  layout.value?.style.setProperty("--nearby-directory-map-columns", `${normalized}fr`);
  layout.value?.style.setProperty("--nearby-directory-list-columns", `${1 - normalized}fr`);
  splitter.value?.setAttribute("aria-valuenow", String(mapPercent));
  splitter.value?.setAttribute(
    "aria-valuetext",
    t("nearbyStations.directory.splitterValue", { map: mapPercent, directory: 100 - mapPercent }),
  );
}

function updateMapRatioFromPointer(clientX: number): void {
  const rect = resizeLayoutRect ?? layout.value?.getBoundingClientRect();
  if (!rect) return;
  const horizontalPadding = 32;
  const usableWidth = Math.max(1, rect.width - horizontalPadding);
  pendingMapRatio = clampMapRatio((clientX - rect.left - horizontalPadding / 2) / usableWidth);
  if (resizeFrame !== undefined) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = undefined;
    if (!resizing.value || pendingMapRatio === undefined) return;
    renderMapRatio(pendingMapRatio);
  });
}

function stopResize(): void {
  if (!resizing.value) return;
  if (resizeFrame !== undefined) {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = undefined;
  }
  if (pendingMapRatio !== undefined) {
    mapRatio.value = pendingMapRatio;
    renderMapRatio(pendingMapRatio);
    pendingMapRatio = undefined;
  }
  resizing.value = false;
  resizeLayoutRect = undefined;
  window.removeEventListener("pointermove", handleResizePointerMove);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
  document.body.style.removeProperty("user-select");
}

function handleResizePointerMove(event: PointerEvent): void {
  if (!resizing.value) return;
  updateMapRatioFromPointer(event.clientX);
}

function startResize(event: PointerEvent): void {
  if (window.matchMedia("(max-width: 767px)").matches) return;
  event.preventDefault();
  resizeLayoutRect = layout.value?.getBoundingClientRect();
  if (!resizeLayoutRect) return;
  resizing.value = true;
  document.body.style.userSelect = "none";
  updateMapRatioFromPointer(event.clientX);
  window.addEventListener("pointermove", handleResizePointerMove);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const step = event.shiftKey ? 0.08 : 0.04;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    mapRatio.value = clampMapRatio(mapRatio.value - step);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    mapRatio.value = clampMapRatio(mapRatio.value + step);
  } else if (event.key === "Home") {
    event.preventDefault();
    mapRatio.value = 0.38;
  } else if (event.key === "End") {
    event.preventDefault();
    mapRatio.value = 0.8;
  }
}

async function selectPlace(placeId?: string): Promise<void> {
  const nextPlaceId = localSelectedPlaceId.value === placeId ? undefined : placeId;
  localSelectedPlaceId.value = nextPlaceId;
  preserveSelectedPlaceOutsideRadius.value = Boolean(nextPlaceId);
  emit("selectPlace", nextPlaceId);
  if (!nextPlaceId) return;
  mobileMapOpen.value = true;
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  await nextTick();
  mobileMapSection.value?.scrollIntoView({
    behavior: reducedMotion.value ? "auto" : "smooth",
    block: "start",
  });
}

function updateWalkingMinutes(value: NearbyWalkingMinutes): void {
  // A new radius is an explicit filter intent; only the current route
  // hydration may temporarily keep a selected place beyond that radius.
  preserveSelectedPlaceOutsideRadius.value = false;
  emit("update:walkingMinutes", value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resetTransientState();
      lockDocumentScroll();
      await nextTick();
      searchInput.value?.focus();
    } else {
      restoreDocumentScroll();
      resetTransientState();
      await nextTick();
      previousFocus?.focus();
      previousFocus = null;
    }
  },
  { immediate: true },
);

watch(directoryVisiblePlaces, (places) => {
  if (selectedPlaceId.value && !places.some((place) => place.id === selectedPlaceId.value)) {
    localSelectedPlaceId.value = undefined;
    emit("selectPlace", undefined);
  }
});

onBeforeUnmount(() => {
  stopResize();
  if (props.open) restoreDocumentScroll();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="nearby-directory-fade">
      <div
        v-if="open"
        class="nearby-directory-backdrop"
        data-testid="nearby-places-directory"
        @click.self="requestClose"
      >
        <section
          ref="dialog"
          class="nearby-directory"
          role="dialog"
          aria-modal="true"
          :aria-label="t('nearbyStations.directory.title')"
          @keydown="handleKeydown"
        >
          <header class="nearby-directory__header">
            <div class="nearby-directory__identity">
              <p>{{ t("nearbyStations.directory.eyebrow") }}</p>
              <h2>{{ t("nearbyStations.directory.title") }}</h2>
              <span v-if="origin.label"><MapIcon :size="14" aria-hidden="true" />{{ origin.label }}</span>
            </div>
            <label class="nearby-directory__search">
              <Search :size="20" aria-hidden="true" />
              <input
                ref="searchInput"
                v-model="query"
                type="search"
                :placeholder="t('nearbyStations.directory.searchPlaceholder')"
                :aria-label="t('nearbyStations.directory.searchLabel')"
              />
            </label>
            <button
              class="nearby-directory__close"
              type="button"
              :aria-label="t('common.actions.close')"
              :title="t('common.actions.close')"
              @click="requestClose"
            >
              <X :size="22" aria-hidden="true" />
            </button>
          </header>

          <div
            ref="layout"
            class="nearby-directory__layout"
            :style="layoutStyle"
          >
            <section
              ref="mobileMapSection"
              class="nearby-directory__map-section"
              :class="{ 'nearby-directory__map-section--open': mobileMapOpen }"
              :aria-label="t('nearbyStations.directory.mapTitle')"
            >
              <button
                class="nearby-directory__map-toggle"
                type="button"
                :aria-expanded="mobileMapOpen"
                aria-controls="nearby-directory-map"
                @click="mobileMapOpen = !mobileMapOpen"
              >
                <span><MapIcon :size="18" aria-hidden="true" />{{ t("nearbyStations.directory.mapTitle") }}</span>
                <ChevronDown :size="18" aria-hidden="true" />
              </button>
              <div id="nearby-directory-map" class="nearby-directory__map-content">
                <NearbyStationsMap
                  variant="places-preview"
                  :suspend-resize-work="resizing"
                  :origin="origin"
                  :radius="radiusMeters"
                  :stations="[]"
                  :selected-line-ids="() => []"
                  :active-modes="[]"
                  :places="mapPlaces"
                  :selected-place-id="selectedPlaceId"
                  :walking-routes="walkingRoutes"
                  :walking-route="selectedWalkingRoute"
                  :basemap-style="basemapStyle"
                  allow-zoom
                  show-nearby-places
                  @select-place="selectPlace"
                  @place-context-menu="handlePlaceContextMenu"
                />
                <button
                  v-if="selectedPlace"
                  class="nearby-directory__overview"
                  type="button"
                  @click="selectPlace(selectedPlace.id)"
                >
                  <RotateCcw :size="16" aria-hidden="true" />
                  {{ t("nearbyStations.directory.backToOverview") }}
                </button>
                <button class="nearby-directory__back-list" type="button" @click="mobileMapOpen = false">
                  {{ t("nearbyStations.directory.backToList") }}
                </button>
              </div>
            </section>

            <button
              ref="splitter"
              class="nearby-directory__splitter"
              type="button"
              role="separator"
              tabindex="0"
              :aria-label="t('nearbyStations.directory.resizeColumns')"
              :aria-valuemin="38"
              :aria-valuemax="80"
              :aria-valuenow="Math.round(mapRatio * 100)"
              :aria-valuetext="t('nearbyStations.directory.splitterValue', { map: Math.round(mapRatio * 100), directory: 100 - Math.round(mapRatio * 100) })"
              @pointerdown="startResize"
              @keydown="resizeWithKeyboard"
            >
              <span aria-hidden="true"><i></i><i></i><i></i></span>
            </button>

            <NearbyPlacesAnnuary
              :places="places"
              :walking-minutes="walkingMinutes"
              :origin-city="origin.city"
              :query="query"
              :selected-place-id="selectedPlaceId"
              :preserve-selected-place-outside-radius="preserveSelectedPlaceOutsideRadius"
              :walking-routes="walkingRoutes"
              :walking-progress="walkingProgress"
              :loading-group-ids="loadingGroupIds"
              :initial-preload-group-count="initialPreloadGroupCount"
              :loading="loading"
              :error="error"
              @update:query="query = $event"
              @update:walking-minutes="updateWalkingMinutes"
              @update:visible-places="directoryVisiblePlaces = $event"
              @request-group-walking-routes="(groupId, groupPlaces) => emit('requestGroupWalkingRoutes', groupId, groupPlaces)"
              @place-context-menu="handlePlaceContextMenu"
              @select-place="selectPlace"
              @retry="emit('retry')"
            />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nearby-directory-backdrop { background: rgba(16,25,58,.66); inset: 0; padding: 10px; position: fixed; z-index: 12010; }
.nearby-directory { background: #f7f8fc; border: 1px solid rgba(81,70,255,.16); border-radius: 18px; box-shadow: 0 28px 80px rgba(16,25,58,.28); box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0,1fr); height: calc(100dvh - 20px); margin: 0 auto; max-width: 1660px; overflow: hidden; width: 100%; }
.nearby-directory__header { align-items: center; background: #fff; border-bottom: 1px solid rgba(16,35,63,.1); display: grid; gap: 22px; grid-template-columns: minmax(270px,.8fr) minmax(340px,1.15fr) 44px; padding: 16px 20px; }
.nearby-directory__identity { min-width: 0; }
.nearby-directory__identity p { color: #5146ff; font-size: .68rem; font-weight: 900; letter-spacing: .1em; margin: 0 0 3px; text-transform: uppercase; }
.nearby-directory__identity h2 { color: var(--ink); font-size: clamp(1.3rem,2.2vw,1.85rem); line-height: 1.05; margin: 0; }
.nearby-directory__identity span { align-items: center; color: var(--muted); display: flex; font-size: .72rem; font-weight: 750; gap: 5px; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-directory__search { align-items: center; background: #f8f9fd; border: 1px solid rgba(16,35,63,.14); border-radius: 12px; display: flex; gap: 10px; min-height: 46px; padding: 0 14px; }
.nearby-directory__search:focus-within { border-color: #5146ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); }
.nearby-directory__search svg { color: #5146ff; flex: 0 0 auto; }
.nearby-directory__search input { background: transparent; border: 0; color: var(--ink); font: inherit; min-width: 0; outline: 0; width: 100%; }
.nearby-directory__close { align-items: center; background: #f1efff; border: 1px solid rgba(81,70,255,.16); border-radius: 11px; color: #4034df; display: flex; height: 42px; justify-content: center; padding: 0; width: 42px; }
.nearby-directory__close:hover,.nearby-directory__close:focus-visible { background: #5146ff; color: #fff; outline: 0; }
.nearby-directory__toolbar { align-items: center; background: rgba(255,255,255,.84); border-bottom: 1px solid rgba(16,35,63,.08); display: flex; gap: 18px; justify-content: space-between; padding: 10px 20px; }
.nearby-directory__toolbar p { color: var(--muted); font-size: .75rem; font-weight: 800; margin: 0; }
.nearby-directory__radius { align-items: center; background: #f1efff; border-radius: 11px; color: #5146ff; display: flex; gap: 3px; padding: 4px; }
.nearby-directory__radius > svg { margin: 0 5px; }
.nearby-directory__radius button { background: transparent; border-radius: 8px; color: #5e6480; font-size: .72rem; min-height: 32px; padding: 6px 9px; }
.nearby-directory__radius button.nearby-directory__radius-button--active { background: #5146ff; box-shadow: 0 3px 9px rgba(81,70,255,.24); color: #fff; }
.nearby-directory__layout { column-gap: 8px; display: grid; grid-template-columns: minmax(0,var(--nearby-directory-map-columns)) 12px minmax(0,var(--nearby-directory-list-columns)); grid-template-rows: auto minmax(0,1fr); min-height: 0; padding: 16px; row-gap: 0; scrollbar-color: rgba(81,70,255,.48) rgba(241,239,255,.72); scrollbar-width: thin; }
.nearby-directory__layout::-webkit-scrollbar { height: 9px; width: 9px; }
.nearby-directory__layout::-webkit-scrollbar-track { background: #f1efff; border-radius: 999px; }
.nearby-directory__layout::-webkit-scrollbar-thumb { background: #b8b2ff; border: 2px solid #f1efff; border-radius: 999px; }
.nearby-directory__layout::-webkit-scrollbar-thumb:hover { background: #5146ff; }
.nearby-directory__map-section { grid-column: 1; grid-row: 2; min-height: 0; position: relative; }
.nearby-directory__splitter { align-items: center; align-self: stretch; background: transparent; border: 0; border-radius: 999px; color: #8d91b0; cursor: col-resize; display: flex; grid-column: 2; grid-row: 2; justify-content: center; min-height: 160px; min-width: 12px; padding: 0; touch-action: none; }
.nearby-directory__splitter > span { align-items: center; background: #e3e2f2; border: 1px solid rgba(81,70,255,.12); border-radius: 999px; display: flex; flex-direction: column; gap: 3px; justify-content: center; min-height: 62px; padding: 7px 2px; transition: background 160ms ease,box-shadow 160ms ease; width: 5px; }
.nearby-directory__splitter i { background: currentColor; border-radius: 50%; display: block; height: 3px; width: 3px; }
.nearby-directory__splitter:hover,.nearby-directory__splitter:focus-visible { color: #5146ff; outline: 0; }
.nearby-directory__splitter:hover > span,.nearby-directory__splitter:focus-visible > span { background: #dcd9ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); }
.nearby-directory__map-toggle { display: none; }
.nearby-directory__map-content { height: 100%; min-height: 0; position: relative; }
.nearby-directory__map-content :deep(.nearby-map-shell) { height: 100%; }
.nearby-directory__map-content :deep(.nearby-map) { border-radius: 16px; height: 100%; min-height: 360px; }
.nearby-directory__overview { align-items: center; background: rgba(255,255,255,.96); border: 1px solid rgba(81,70,255,.2); border-radius: 10px; bottom: 14px; box-shadow: 0 5px 16px rgba(16,35,63,.16); color: #4034df; display: flex; font-size: .72rem; font-weight: 850; gap: 6px; left: 14px; min-height: 36px; padding: 7px 10px; position: absolute; z-index: 20; }
.nearby-directory__back-list { display: none; }
.nearby-directory__results { background: #fff; border: 1px solid rgba(16,35,63,.1); border-radius: 16px; box-shadow: 0 8px 24px rgba(16,35,63,.05); container-type: inline-size; justify-self: stretch; max-width: none; min-height: 0; overflow: auto; width: 100%; }
.nearby-directory__groups { display: grid; gap: 7px; padding: 10px; }
.nearby-directory__group { --directory-tone:#64748b; border: 1px solid rgba(16,35,63,.09); border-radius: 12px; overflow: hidden; }
.nearby-directory__group--green { --directory-tone:#17864c; }.nearby-directory__group--orange { --directory-tone:#e16919; }.nearby-directory__group--teal { --directory-tone:#0f8e8a; }.nearby-directory__group--pink { --directory-tone:#cf3d78; }.nearby-directory__group--blue { --directory-tone:#2474c8; }.nearby-directory__group--indigo { --directory-tone:#5146ff; }.nearby-directory__group--purple { --directory-tone:#7c3db5; }.nearby-directory__group--amber { --directory-tone:#b77910; }
.nearby-directory__group h3 { margin: 0; }
.nearby-directory__group h3 > button { align-items: center; background: #fff; border-radius: 0; color: var(--ink); display: grid; gap: 10px; grid-template-columns: 34px minmax(0,1fr) auto 24px; min-height: 50px; padding: 7px 12px; text-align: left; width: 100%; }
.nearby-directory__group h3 > button:hover,.nearby-directory__group h3 > button:focus-visible { background: #fafaff; outline: 0; }
.nearby-directory__group-icon,.nearby-directory__place-icon { align-items: center; background: color-mix(in srgb,var(--directory-tone) 12%,white); border-radius: 50%; color: var(--directory-tone); display: flex; height: 32px; justify-content: center; width: 32px; }
.nearby-directory__group-title { font-size: .88rem; font-weight: 900; }
.nearby-directory__group-count { background: color-mix(in srgb,var(--directory-tone) 10%,white); border-radius: 999px; color: var(--directory-tone); font-size: .68rem; font-weight: 900; min-width: 25px; padding: 3px 7px; text-align: center; }
.nearby-directory__chevron { color: var(--directory-tone); transition: transform 220ms ease; }
[aria-expanded="true"] > .nearby-directory__chevron { transform: rotate(180deg); }
.nearby-directory__accordion { display: grid; grid-template-rows: 0fr; opacity: .25; transition: grid-template-rows 220ms ease,opacity 180ms ease; }
.nearby-directory__accordion > div { min-height: 0; overflow: hidden; }
.nearby-directory__accordion--open { grid-template-rows: 1fr; opacity: 1; }
.nearby-directory__place-grid { border-top: 1px solid rgba(16,35,63,.08); display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,300px),1fr)); padding: 3px 8px 8px; }
.nearby-directory__place { align-items: center; background: transparent; border-bottom: 1px solid rgba(16,35,63,.07); border-radius: 8px; color: var(--ink); display: grid; gap: 8px; grid-template-columns: 30px minmax(0,1fr) auto; min-height: 52px; padding: 7px 8px; text-align: left; width: 100%; }
.nearby-directory__place:last-child { border-bottom-color: transparent; }
.nearby-directory__place:hover,.nearby-directory__place:focus-visible { background: #f8f7ff; outline: 0; }
.nearby-directory__place--selected { background: #eeecff; box-shadow: inset 0 0 0 1px rgba(81,70,255,.35); }
.nearby-directory__place-icon { height: 28px; width: 28px; }
.nearby-directory__place-copy { display: grid; gap: 2px; min-width: 0; }
.nearby-directory__place-copy strong { font-size: .77rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-directory__place-copy > span { color: #8b91a7; font-size: .61rem; max-height: 0; opacity: 0; overflow: hidden; text-overflow: ellipsis; transition: max-height 160ms ease,opacity 160ms ease; white-space: nowrap; }
.nearby-directory__place:hover .nearby-directory__place-copy > span,.nearby-directory__place:focus-visible .nearby-directory__place-copy > span,.nearby-directory__place--selected .nearby-directory__place-copy > span { max-height: 18px; opacity: 1; }
.nearby-directory__place-walk { align-items: center; color: #5146ff; display: inline-flex; font-size: .62rem; font-weight: 850; gap: 3px; white-space: nowrap; }
.nearby-directory__state { align-items: center; color: var(--muted); display: flex; flex-direction: column; gap: 8px; justify-content: center; min-height: 320px; padding: 30px; text-align: center; }
.nearby-directory__state svg { color: #5146ff; }.nearby-directory__state strong { color: var(--ink); }.nearby-directory__state span { font-size: .8rem; }
.nearby-directory__state button { align-items: center; display: inline-flex; gap: 6px; }.nearby-directory__state--error svg { color: #b42318; }
.nearby-directory__spin { animation: nearby-directory-spin 900ms linear infinite; }
.nearby-directory-fade-enter-active,.nearby-directory-fade-leave-active { transition: opacity 180ms ease; }.nearby-directory-fade-enter-from,.nearby-directory-fade-leave-to { opacity: 0; }
@keyframes nearby-directory-spin { to { transform: rotate(360deg); } }
@media (max-width:1179px) {
  .nearby-directory__layout { grid-template-columns: minmax(0,var(--nearby-directory-map-columns)) 12px minmax(0,var(--nearby-directory-list-columns)); }
  .nearby-directory__place:last-child { border-bottom-color: transparent; }
}
@media (max-width:767px) {
  .nearby-directory-backdrop { background: #f7f8fc; padding: 0; }
  .nearby-directory { border: 0; border-radius: 0; height: 100dvh; }
  .nearby-directory__header { gap: 10px; grid-template-columns: minmax(0,1fr) 42px; padding: max(12px,env(safe-area-inset-top)) 12px 10px; }
  .nearby-directory__identity h2 { font-size: 1.2rem; }.nearby-directory__identity span { max-width: 100%; }
  .nearby-directory__search { grid-column: 1/-1; grid-row: 2; min-height: 42px; }.nearby-directory__close { grid-column: 2; grid-row: 1; }
  .nearby-directory__toolbar { align-items: stretch; flex-direction: column; gap: 8px; padding: 8px 12px; }.nearby-directory__toolbar p { text-align: center; }
  .nearby-directory__radius { justify-content: center; }.nearby-directory__radius button { flex: 1 1 0; }
  .nearby-directory__layout { display: block; overflow: auto; padding: 10px 10px max(20px,env(safe-area-inset-bottom)); }
  .nearby-directory__splitter { display: none; }
  .nearby-directory__map-section { background: #fff; border: 1px solid rgba(16,35,63,.1); border-radius: 13px; margin-bottom: 9px; overflow: hidden; }
  .nearby-directory__map-toggle { align-items: center; background: #fff; color: var(--ink); display: flex; font-size: .8rem; font-weight: 900; justify-content: space-between; min-height: 46px; padding: 8px 12px; width: 100%; }.nearby-directory__map-toggle span { align-items: center; display: flex; gap: 8px; }.nearby-directory__map-toggle > svg { transition: transform 220ms ease; }
  .nearby-directory__map-section--open .nearby-directory__map-toggle > svg { transform: rotate(180deg); }
  .nearby-directory__map-content { display: grid; grid-template-rows: 0fr; height: auto; opacity: .2; transition: grid-template-rows 220ms ease,opacity 180ms ease; }.nearby-directory__map-content > * { min-height: 0; overflow: hidden; }
  .nearby-directory__map-section--open .nearby-directory__map-content { grid-template-rows: minmax(250px,42dvh); opacity: 1; }
  .nearby-directory__map-content :deep(.nearby-map) { min-height: 250px; }
  .nearby-directory__overview { bottom: 12px; }.nearby-directory__back-list { background: rgba(255,255,255,.96); bottom: 12px; color: #4034df; font-size: .7rem; font-weight: 850; min-height: 34px; padding: 6px 9px; position: absolute; right: 12px; z-index: 20; }.nearby-directory__map-section--open .nearby-directory__back-list { display: block; }
  .nearby-directory__results { border-radius: 13px; overflow: visible; }.nearby-directory__groups { padding: 7px; }
  .nearby-directory__place-grid { grid-template-columns: 1fr; }
  .nearby-directory__place-copy > span { max-height: 18px; opacity: 1; }.nearby-directory__place { min-height: 58px; }
}
@media (prefers-reduced-motion:reduce) {
  .nearby-directory-fade-enter-active,.nearby-directory-fade-leave-active,.nearby-directory__accordion,.nearby-directory__chevron,.nearby-directory__map-content,.nearby-directory__map-toggle > svg,.nearby-directory__place-copy > span { transition: none; }
  .nearby-directory__spin { animation: none; }
}
</style>
