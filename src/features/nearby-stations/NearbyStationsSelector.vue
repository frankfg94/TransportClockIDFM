<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowLeft, Check, Crosshair, LoaderCircle, MapPin, Search, TriangleAlert, X } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useUserGeolocation } from "../../composables/useUserGeolocation";
import { useI18n } from "../../i18n";
import type { GlobalMapDashboardTarget } from "../transport-map/adapters/dashboard";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import type { TransportMapBasemapStyle } from "../transport-map/basemap/tileMath";
import CitiesLinePattern from "../line-map/CitiesLinePattern.vue";
import NearbyStationsMap from "./NearbyStationsMap.vue";
import {
  NEARBY_RADIUS_MAX_METERS,
  NEARBY_RADIUS_MIN_METERS,
  NEARBY_RADIUS_STEP_METERS,
  NEARBY_SUPPORTED_MODES,
  selectionToDashboardTargets,
  type NearbyStationEntry,
} from "./nearbyStations";
import { useNearbyStations } from "./useNearbyStations";
import { useNearbyStationsLineFlow } from "./useNearbyStationsLineFlow";
import { readNearbyStationsDraft, saveNearbyStationsDraft } from "./nearbyStationsDraft";

const props = withDefaults(defineProps<{
  open: boolean;
  adding?: boolean;
  basemapStyle?: TransportMapBasemapStyle;
  showIsochroneControl?: boolean;
  showDirectoryControl?: boolean;
  showBasemapControl?: boolean;
  showDisplayControl?: boolean;
  showFullscreenControl?: boolean;
}>(), {
  adding: false,
  showIsochroneControl: true,
  showDirectoryControl: true,
  showBasemapControl: true,
  showDisplayControl: true,
  showFullscreenControl: true,
});

const emit = defineEmits<{
  close: [];
  manual: [];
  confirm: [targets: GlobalMapDashboardTarget[]];
  details: [target: GlobalMapDashboardTarget];
}>();

const { t } = useI18n();
const addressInput = ref<HTMLInputElement>();
const nearby = useNearbyStations({ enabled: () => props.open, initialDraft: readNearbyStationsDraft() });
const geolocation = useUserGeolocation({ enabled: () => props.open, autoStart: false });
const {
  hoveredLineId,
  activeLineId,
  pinnedLine,
  pinnedLinePatternCities,
  lineFlowModel,
  lineFlowLoading,
  handleCameraChange,
  handleHoverLine,
  handleLeaveLine,
  handleActivateLine,
  clearLineFocus,
} = useNearbyStationsLineFlow(nearby, { enabled: () => props.open });

const selectedEntries = computed(() => nearby.selections.value.flatMap((selection) => {
  const entry = nearby.stations.value.find((candidate) => candidate.id === selection.stationId);
  return entry ? [{ entry, lineIds: selection.lineIds }] : [];
}));

const errorMessage = computed(() => {
  switch (nearby.errorType.value) {
    case "api_limit_reached": return t("nearbyStations.errors.apiLimit");
    case "address_not_found": return t("nearbyStations.errors.addressNotFound");
    case "geocoding_unavailable": return t("nearbyStations.errors.geocodingUnavailable");
    case "map_data_unavailable": return t("nearbyStations.errors.mapDataUnavailable");
    case "geolocation_denied": return t("nearbyStations.errors.geolocationDenied");
    case "geolocation_unavailable": return t("nearbyStations.errors.geolocationUnavailable");
    case "unknown": return t("nearbyStations.errors.unknown");
    default: return "";
  }
});

async function locateMe(): Promise<void> {
  nearby.clearError();
  const allowed = await geolocation.askGeolocation();
  const coordinates = geolocation.coordinates.value;
  if (!allowed || !coordinates) {
    nearby.setError(
      geolocation.error.value?.code === "permission-denied" ? "geolocation_denied" : "geolocation_unavailable",
      geolocation.error.value?.message,
    );
    return;
  }
  await nearby.useCoordinates({ lon: coordinates.longitude, lat: coordinates.latitude });
  await geolocation.stopTracking();
}

function viewDetails(stationId: string, lineId: string): void {
  const target = selectionToDashboardTargets(
    nearby.stations.value,
    [{ stationId, lineIds: [lineId] }],
  )[0];
  if (target) {
    saveNearbyStationsDraft(nearby.createDraft());
    emit("details", target);
  }
}

function confirm(): void {
  if (!props.adding && nearby.selectedTargets.value.length > 0) {
    emit("confirm", nearby.selectedTargets.value);
  }
}

function retry(): void {
  nearby.clearError();
  if (nearby.selectedPlace.value) void nearby.scanNearbyStations();
  else if (nearby.query.value.trim().length >= 3) void nearby.searchAddress();
}

function lineById(entry: NearbyStationEntry, lineId: string) {
  return entry.lines.find((line) => line.id === lineId);
}

function modeActive(mode: GlobalMapMode): boolean {
  return nearby.activeModes.value.includes(mode);
}

function modeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return t("nearbyStations.modes.metro");
    case "RER": return t("nearbyStations.modes.rer");
    case "TRAIN": return t("nearbyStations.modes.train");
    case "TRANSILIEN": return t("nearbyStations.modes.transilien");
    case "TRAM": return t("nearbyStations.modes.tram");
    case "CABLE": return t("nearbyStations.modes.cable");
    case "BUS": return t("nearbyStations.modes.bus");
    case "NOCTILIEN": return t("nearbyStations.modes.noctilien");
    default: return mode;
  }
}

function handleActiveModesUpdate(modes: GlobalMapMode[]): void {
  nearby.setActiveModes(modes);
}

function handleClusterGroupingDistanceUpdate(value: number): void {
  nearby.clusterGroupingDistanceMeters.value = value;
}

</script>

<template>
  <AppModal
    :open="open"
    :title="t('nearbyStations.title')"
    panel-class="nearby-stations-modal"
    @close="emit('close')"
  >
    <template #header>
      <div class="nearby-selector__heading">
        <button class="icon-button" type="button" :aria-label="t('nearbyStations.manual')" @click="emit('manual')">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <h2>{{ t("nearbyStations.title") }}</h2>
          <p>{{ t("nearbyStations.subtitle") }}</p>
        </div>
      </div>
    </template>

    <div class="nearby-selector">
      <form class="nearby-selector__search" role="search" @submit.prevent="nearby.searchAddress">
        <div class="nearby-selector__autocomplete">
          <Search :size="20" aria-hidden="true" />
          <input
            ref="addressInput"
            v-model="nearby.query.value"
            autocomplete="street-address"
            :aria-label="t('nearbyStations.addressLabel')"
            :placeholder="t('nearbyStations.addressPlaceholder')"
            type="search"
          />
          <LoaderCircle v-if="nearby.isSuggesting.value" class="nearby-selector__spin" :size="19" aria-hidden="true" />
          <ul v-if="nearby.suggestions.value.length" class="nearby-selector__suggestions" :aria-label="t('nearbyStations.suggestionsAria')">
            <li v-for="suggestion in nearby.suggestions.value" :key="suggestion.id ?? `${suggestion.lon}:${suggestion.lat}`">
              <button type="button" @click="nearby.selectPlace(suggestion)">
                <MapPin :size="18" aria-hidden="true" />
                <span><strong>{{ suggestion.label }}</strong><small v-if="suggestion.city">{{ suggestion.city }}<template v-if="suggestion.postcode"> · {{ suggestion.postcode }}</template></small></span>
              </button>
            </li>
          </ul>
        </div>
        <button class="button-secondary nearby-selector__locate" type="button" :disabled="geolocation.isLoading.value" @click="locateMe">
          <LoaderCircle v-if="geolocation.isLoading.value" class="nearby-selector__spin" :size="18" />
          <Crosshair v-else :size="18" aria-hidden="true" />
          {{ t("nearbyStations.locateMe") }}
        </button>
      </form>

      <div v-if="nearby.selectedPlace.value" class="nearby-selector__resolved" role="status">
        <MapPin :size="19" aria-hidden="true" />
        <span>{{ nearby.selectedPlace.value.label }}</span>
        <Check :size="19" aria-hidden="true" />
      </div>

      <section class="nearby-selector__radius">
        <div class="nearby-selector__radius-label">
          <label for="nearby-radius">{{ t("nearbyStations.radius") }}</label>
          <strong>{{ nearby.radius.value }} m</strong>
        </div>
        <input
          id="nearby-radius"
          v-model.number="nearby.radius.value"
          type="range"
          :min="NEARBY_RADIUS_MIN_METERS"
          :max="NEARBY_RADIUS_MAX_METERS"
          :step="NEARBY_RADIUS_STEP_METERS"
        />
        <div class="nearby-selector__radius-ticks" aria-hidden="true">
          <span>200 m</span><span>600 m</span><span>1 000 m</span><span>1 500 m</span>
        </div>
      </section>

      <section v-if="nearby.selectedPlace.value" class="nearby-selector__filters" :aria-label="t('nearbyStations.filtersAria')">
        <button
          v-for="mode in NEARBY_SUPPORTED_MODES"
          :key="mode"
          type="button"
          :class="{ 'nearby-selector__filter--active': modeActive(mode) }"
          :aria-pressed="modeActive(mode)"
          @click="nearby.toggleMode(mode)"
        >{{ modeLabel(mode) }}</button>
      </section>

      <NearbyStationsMap
        v-if="nearby.selectedPlace.value"
        :origin="nearby.selectedPlace.value"
        :radius="nearby.radius.value"
        :stations="nearby.visibleStations.value"
        :selected-line-ids="nearby.selectedLineIds"
        :active-modes="nearby.activeModes.value"
        :basemap-style="props.basemapStyle"
        :show-isochrone-control="props.showIsochroneControl"
        :show-directory-control="props.showDirectoryControl"
        :show-basemap-control="props.showBasemapControl"
        :show-display-control="props.showDisplayControl"
        :show-fullscreen-control="props.showFullscreenControl"
        :available-modes="NEARBY_SUPPORTED_MODES"
        :loading="nearby.isScanning.value || lineFlowLoading"
        :line-flow-model="lineFlowModel"
        :active-line-id="activeLineId"
        :hovered-line-id="hoveredLineId"
        :cluster-grouping-distance-meters="nearby.clusterGroupingDistanceMeters.value"
        @camera-change="handleCameraChange"
        @hover-line="handleHoverLine"
        @leave-line="handleLeaveLine"
        @activate-line="handleActivateLine"
        @clear-line-focus="clearLineFocus"
        @update-active-modes="handleActiveModesUpdate"
        @update-cluster-grouping-distance="handleClusterGroupingDistanceUpdate"
        @toggle-station="nearby.toggleStation"
        @toggle-line="nearby.toggleLine"
        @details="viewDetails"
      >
        <template #city-pattern>
          <section
            v-if="pinnedLine"
            class="nearby-selector__city-pattern"
            :aria-label="t('globalMap.sidebar.lineCities')"
          >
            <div class="nearby-selector__city-pattern-title">
              <strong>{{ t("globalMap.sidebar.lineCities") }}</strong>
              <small>{{ pinnedLinePatternCities.length }}</small>
            </div>
            <CitiesLinePattern
              :cities="pinnedLinePatternCities"
              :line-color="pinnedLine.color"
              :line-mode="pinnedLine.mode"
              :empty-label="t('globalMap.sidebar.lineUnavailable')"
            />
          </section>
        </template>
      </NearbyStationsMap>

      <section v-else class="nearby-selector__empty">
        <Crosshair :size="32" aria-hidden="true" />
        <strong>{{ t("nearbyStations.emptyTitle") }}</strong>
        <span>{{ t("nearbyStations.emptyBody") }}</span>
      </section>

      <section v-if="selectedEntries.length" class="nearby-selector__selected" :aria-label="t('nearbyStations.selectedAria')">
        <header>
          <h3>{{ t("nearbyStations.selected", { count: nearby.selectedStationCount.value }) }}</h3>
          <button type="button" @click="nearby.clearSelection">{{ t("nearbyStations.clearAll") }}</button>
        </header>
        <div class="nearby-selector__cards">
          <article v-for="selection in selectedEntries" :key="selection.entry.id">
            <div>
              <strong>{{ selection.entry.station.name }}</strong>
              <span class="nearby-selector__card-lines">
                <LineIconBadge
                  v-for="lineId in selection.lineIds"
                  :key="lineId"
                  :line="lineById(selection.entry, lineId)!"
                  compact
                />
              </span>
            </div>
            <button type="button" :aria-label="t('nearbyStations.removeStation', { station: selection.entry.station.name })" @click="nearby.toggleStation(selection.entry.id)">
              <X :size="17" aria-hidden="true" />
            </button>
          </article>
        </div>
      </section>

      <aside v-if="errorMessage" class="nearby-selector__error" role="alert">
        <TriangleAlert :size="20" aria-hidden="true" />
        <span>{{ errorMessage }}</span>
        <button v-if="nearby.error.value?.retryable" type="button" @click="retry">{{ t("common.actions.retry") }}</button>
        <button type="button" :aria-label="t('common.actions.close')" @click="nearby.clearError"><X :size="17" /></button>
      </aside>
    </div>

    <template #footer>
      <button class="button-secondary" type="button" @click="emit('manual')">
        <ArrowLeft :size="18" aria-hidden="true" /> {{ t("nearbyStations.manual") }}
      </button>
      <button type="button" :disabled="nearby.selectedBoardCount.value === 0 || adding" @click="confirm">
        <LoaderCircle v-if="adding" class="nearby-selector__spin" :size="18" />
        <Check v-else :size="18" aria-hidden="true" />
        {{ t("nearbyStations.confirm", { count: nearby.selectedStationCount.value }) }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
:global(.nearby-stations-modal) { max-height: min(94vh, 920px); max-width: 1080px; width: min(96vw, 1080px); }
:global(.nearby-stations-modal .app-modal__body) { padding: 0; }
.nearby-selector { display: grid; gap: 15px; overflow-y: auto; padding: 18px 20px; }
.nearby-selector__heading { align-items: flex-start; display: flex; gap: 14px; }
.nearby-selector__heading h2 { margin: 0; }
.nearby-selector__heading p { color: var(--muted); font-size: .9rem; font-weight: 720; margin: 3px 0 0; }
.nearby-selector__search { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) auto; }
.nearby-selector__autocomplete { align-items: center; border: 1px solid var(--border); border-radius: 12px; display: flex; min-height: 48px; padding: 0 14px; position: relative; }
.nearby-selector__autocomplete > svg { color: var(--muted); flex: none; }
.nearby-selector__autocomplete input { background: transparent; border: 0; color: var(--ink); font: inherit; font-weight: 760; min-width: 0; outline: 0; padding: 13px 11px; width: 100%; }
.nearby-selector__suggestions { background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 15px 35px rgba(16,35,63,.18); left: 0; list-style: none; margin: 7px 0 0; max-height: 280px; overflow-y: auto; padding: 6px; position: absolute; right: 0; top: 100%; z-index: 30; }
.nearby-selector__suggestions button { align-items: center; background: transparent; color: var(--ink); display: flex; gap: 10px; justify-content: flex-start; padding: 10px; text-align: left; width: 100%; }
.nearby-selector__suggestions button:hover { background: var(--surface-muted); }
.nearby-selector__suggestions span { display: grid; gap: 2px; justify-items: start; min-width: 0; text-align: left; width: 100%; }
.nearby-selector__suggestions strong, .nearby-selector__suggestions small { text-align: left; width: 100%; }
.nearby-selector__suggestions small { color: var(--muted); }
.nearby-selector__locate { white-space: nowrap; }
.nearby-selector__resolved { align-items: center; background: #f5f7fa; border-radius: 11px; display: grid; gap: 10px; grid-template-columns: auto 1fr auto; padding: 11px 13px; }
.nearby-selector__resolved span { font-weight: 820; }
.nearby-selector__resolved svg:last-child { color: #35a853; }
.nearby-selector__radius { display: grid; gap: 8px; }
.nearby-selector__radius-label { align-items: baseline; display: grid; grid-template-columns: 1fr auto auto; gap: 12px; }
.nearby-selector__radius-label label, .nearby-selector__radius-label strong { font-weight: 920; }
.nearby-selector__radius-label strong { font-size: 1.15rem; }
.nearby-selector__radius-label span { color: var(--muted); font-size: .82rem; }
.nearby-selector__radius input { accent-color: #5146ff; width: 100%; }
.nearby-selector__radius-ticks { color: var(--muted); display: flex; font-size: .76rem; font-weight: 760; justify-content: space-between; }
.nearby-selector__filters { display: flex; gap: 6px; min-height: 36px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.nearby-selector__filters::-webkit-scrollbar { display: none; }
.nearby-selector__filters button { background: #f2f4f8; color: var(--muted); font-size: .78rem; min-height: 34px; padding: 7px 10px; white-space: nowrap; }
.nearby-selector__filters .nearby-selector__filter--active { background: #e8e5ff; color: #4034df; box-shadow: inset 0 0 0 1px rgba(81,70,255,.25); }
.nearby-selector__empty { align-items: center; background: linear-gradient(135deg, #f7f7ff, #eef4fa); border: 1px dashed rgba(81,70,255,.3); border-radius: 14px; color: var(--muted); display: flex; flex-direction: column; gap: 7px; justify-content: center; min-height: 240px; padding: 28px; text-align: center; }
.nearby-selector__empty svg { color: #5146ff; }
.nearby-selector__empty strong { color: var(--ink); font-size: 1.08rem; }
.nearby-selector__city-pattern { border-top: 1px solid var(--border); display: grid; gap: 10px; margin-top: 4px; padding-top: 14px; }
.nearby-selector__city-pattern-title { align-items: center; color: var(--ink); display: flex; font-size: .82rem; justify-content: space-between; }
.nearby-selector__city-pattern-title small { color: var(--muted); font-size: .72rem; }
.nearby-selector__selected { display: grid; gap: 10px; }
.nearby-selector__selected header { align-items: center; display: flex; justify-content: space-between; }
.nearby-selector__selected h3 { font-size: 1rem; margin: 0; }
.nearby-selector__selected header button { background: transparent; color: #5146ff; font-size: .82rem; padding: 5px; }
.nearby-selector__cards { display: grid; gap: 9px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.nearby-selector__cards article { align-items: flex-start; border: 1px solid var(--border); border-radius: 11px; display: flex; gap: 7px; justify-content: space-between; min-width: 0; padding: 11px; }
.nearby-selector__cards article > div { display: grid; gap: 6px; min-width: 0; }
.nearby-selector__cards strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-selector__cards article > button { background: transparent; color: var(--muted); min-height: 28px; padding: 4px; }
.nearby-selector__card-lines { display: flex; flex-wrap: wrap; gap: 4px; }
.nearby-selector__card-lines :deep(.line-icon-badge) { height: 24px; min-width: 26px; }
.nearby-selector__card-lines :deep(.line-icon-badge img) { max-height: 24px; max-width: 45px; }
.nearby-selector__error { align-items: center; background: #fff7e9; border: 1px solid #f1d3a2; border-radius: 11px; color: #8a5100; display: grid; gap: 9px; grid-template-columns: auto 1fr auto auto; padding: 11px 13px; }
.nearby-selector__error button { background: transparent; color: #5146ff; font-size: .82rem; padding: 5px; }
.nearby-selector__spin { animation: nearby-spin 800ms linear infinite; }
@keyframes nearby-spin { to { transform: rotate(360deg); } }
@media (max-width: 680px) {
  :global(.modal-backdrop:has(.nearby-stations-modal)) { padding: 0; }
  :global(.nearby-stations-modal) { border-radius: 0; height: 100dvh; max-height: 100dvh; max-width: none; width: 100%; }
  :global(.nearby-stations-modal .modal-panel__header) { padding-top: max(14px, env(safe-area-inset-top)); }
  :global(.nearby-stations-modal .modal-panel__footer) { padding-bottom: max(14px, env(safe-area-inset-bottom)); }
  .nearby-selector { padding: 14px; }
  .nearby-selector__heading p { display: none; }
  .nearby-selector__search { grid-template-columns: 1fr; }
  .nearby-selector__locate { width: 100%; }
  .nearby-selector__radius-label { grid-template-columns: 1fr auto; }
  .nearby-selector__radius-label span { display: none; }
  .nearby-selector__cards { display: flex; overflow-x: auto; }
  .nearby-selector__cards article { flex: 0 0 220px; }
}
@media (prefers-reduced-motion: reduce) { .nearby-selector__spin { animation-duration: 1.5s; } }
</style>
