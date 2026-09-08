<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Building2,
  ChevronDown,
  Database,
  Edit2,
  GitBranch,
  MapPinned,
  Route,
  Shuffle,
  Train,
} from "lucide-vue-next";
import AnnualRidershipCard from "./AnnualRidershipCard.vue";
import GtfsFrequencyCard from "./GtfsFrequencyCard.vue";
import AnnualRidershipStationCard from "./AnnualRidershipStationCard.vue";
import CitiesLinePattern from "./CitiesLinePattern.vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import UserFriendlyTraffic from "../../components/UserFriendlyTraffic.vue";
import MaterialCombobox, { type MaterialComboboxOption } from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import { formatTransitDistance } from "../../services/distance";
import { useNearbyPlacePresenter } from "../nearby-stations/useNearbyPlacePresenter";
import { nearbyPlaceWalkingMinutes } from "../nearby-stations/nearbyPlacePresentation";
import type { NearbyPlace } from "../nearby-stations/nearbyPlaces";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import type { TransitFamily } from "../../types/transit";
import { buildGlobalLineMetadata, type GlobalLineMetadata } from "./globalLineMetadata";
import { buildCitiesLinePatternCities } from "./citiesLinePattern";
import { defaultGlobalDirectionMerge } from "./lineMapData";
import type {
  GlobalMapSidebarBodyEmits,
  GlobalMapSidebarBodyProps,
} from "./globalMapSidebarBodyTypes";

const props = defineProps<GlobalMapSidebarBodyProps>();
const emit = defineEmits<GlobalMapSidebarBodyEmits>();
const { t } = useI18n();
const { presentPlace } = useNearbyPlacePresenter();

const displayLine = computed(() => props.displayLine);
const isLinePreview = computed(() => props.isLinePreview);
const lineMetadata = computed<GlobalLineMetadata | undefined>(() =>
  displayLine.value
    ? buildGlobalLineMetadata(
        displayLine.value,
        props.stations,
        isLinePreview.value ? props.previewPaths : props.paths,
      )
    : undefined,
);
const cityPatternRouteStations = computed(() =>
  props.cityPatternStations.length
    ? props.cityPatternStations
    : (lineMetadata.value?.stations ?? []),
);
const servedCitiesPattern = computed(() =>
  buildCitiesLinePatternCities(cityPatternRouteStations.value),
);
const lineConnectionOptions = computed(() => {
  const linesById = new Map(props.allLines.map((line) => [line.id, line]));
  return (
    (lineMetadata.value?.connectionLineIds ?? [])
      .map((lineId) => linesById.get(lineId))
      .filter((line): line is GlobalMapLine => Boolean(line))
      // Nearby bus stops are useful on a station card, but they would drown out
      // the actual rail/tram interchanges on a line profile.
      .filter((line) => line.mode !== "BUS" && line.mode !== "NOCTILIEN")
  );
});
const lineConnectionCount = computed(() =>
  props.allLines.length
    ? lineConnectionOptions.value.length
    : (lineMetadata.value?.connectionLineIds.length ?? 0),
);
const lineGeometryCount = computed(() =>
  Math.max(lineMetadata.value?.pathCount ?? 0, displayLine.value?.geometryIds.length ?? 0),
);
const isBikeLine = computed(() => displayLine.value?.mode === "BIKE");
const lineCount = computed(() =>
  isBikeLine.value
    ? lineGeometryCount.value
    : (lineMetadata.value?.stationCount ?? displayLine.value?.stationIds.length ?? 0),
);
const lineCountLabel = computed(() =>
  isBikeLine.value ? t("globalMap.sidebar.bikeSegments") : t("globalMap.sidebar.stations"),
);
const lineSourceLabels = computed(() => {
  const labels = (lineMetadata.value?.geometrySources ?? []).map(geometrySourceLabel);
  return labels.length ? labels.join(" · ") : t("globalMap.sidebar.lineUnavailable");
});
const optionalDirectionVariants = computed(() =>
  props.directionVariants.filter((direction) => direction.id !== props.selectedMainDirectionId),
);
const itineraryExpanded = ref(!defaultGlobalDirectionMerge(props.displayLine?.mode ?? "BUS"));
const lineCitiesExpanded = ref(false);
const entrancesExpanded = ref(false);
const nearbyRadiusOptions = computed<MaterialComboboxOption[]>(() => [
  { id: "2", label: t("globalMap.sidebar.nearbyPlacesRadius", { minutes: 2 }) },
  { id: "5", label: t("globalMap.sidebar.nearbyPlacesRadius", { minutes: 5 }) },
]);
const presentedNearbyPlaces = computed(() => props.nearbyPlaces.slice(0, 80).map((place: NearbyPlace) => ({
  place,
  presentation: presentPlace(place),
  minutes: nearbyPlaceWalkingMinutes(place),
})));

watch(
  () => [props.displayLine?.id, props.displayLine?.mode] as const,
  () => {
    itineraryExpanded.value = !defaultGlobalDirectionMerge(props.displayLine?.mode ?? "BUS");
    lineCitiesExpanded.value = false;
  },
);

watch(
  () => props.station?.id,
  () => {
    entrancesExpanded.value = false;
  },
);

function modeLabel(mode: GlobalMapLine["mode"]): string {
  const keys: Record<GlobalMapLine["mode"], string> = {
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
  return t(("globalMap.modes." + keys[mode]) as never);
}

function toFamily(mode: GlobalMapLine["mode"]): TransitFamily | undefined {
  if (mode === "METRO") return "METRO";
  if (mode === "RER") return "RER";
  if (mode === "TRAM") return "TRAM";
  if (mode === "BUS") return "BUS";
  if (mode === "NOCTILIEN") return "NOCTILIEN";
  if (mode === "TRANSILIEN" || mode === "TRAIN") return "TRANSILIEN";
  if (mode === "CABLE") return "CABLE";
  return undefined;
}

function geometrySourceLabel(source: string): string {
  if (source === "gtfs") return "GTFS";
  if (source === "netex") return "NeTEx";
  if (source === "mixed") return t("globalMap.sidebar.lineMixed");
  if (source === "official-open-data") return t("globalMap.sidebar.lineOfficialData");
  if (source === "bike-source") return t("globalMap.sidebar.bikeSource");
  if (source === "netex-schematic-fallback") return t("globalMap.sidebar.lineFallback");
  return source;
}

function formatLineLength(lengthKm?: number): string {
  return typeof lengthKm === "number" && lengthKm > 0
    ? formatTransitDistance(lengthKm)
    : t("globalMap.sidebar.lineUnavailable");
}

function updateNearbyRadius(value: string): void {
  emit("update:nearby-radius-minutes", value === "5" ? 5 : 2);
}
</script>

<template>
  <div
    v-if="displayLine"
    class="global-map-picker-sidebar__line-profile"
    :style="{ '--line-color': displayLine.color, '--line-text-color': displayLine.textColor }"
  >
    <UserFriendlyTraffic
      v-if="trafficDisruption && !isLinePreview"
      :disruption="trafficDisruption"
      compact
      collapsible
    />

    <section class="global-map-picker-sidebar__line-hero">
      <div class="global-map-picker-sidebar__line-hero-main">
        <span class="global-map-picker-sidebar__line-hero-badge">
          <LineIconBadge
            :line="{
              id: displayLine.id,
              label: displayLine.label || displayLine.code,
              mode: displayLine.mode,
              family: toFamily(displayLine.mode),
              color: displayLine.color,
              textColor: displayLine.textColor,
              iconUrl: displayLine.pictogram ?? undefined,
              ref: displayLine.id,
            }"
          />
        </span>
        <div>
          <p>{{ t("globalMap.sidebar.lineProfile") }}</p>
          <h3>{{ displayLine.label || displayLine.code }}</h3>
          <span
            >{{ modeLabel(displayLine.mode) }} <i aria-hidden="true">·</i> {{ lineCount }}
            {{ lineCountLabel }}</span
          >
        </div>
      </div>
      <span
        v-if="displayLine.code && displayLine.code !== displayLine.label"
        class="global-map-picker-sidebar__line-code"
        >{{ displayLine.code }}</span
      >
      <div class="global-map-picker-sidebar__line-rule" aria-hidden="true"><span /></div>
    </section>

    <AnnualRidershipStationCard
      v-if="!isLinePreview && station"
      :station="ridershipStation"
      :loading="ridershipStationLoading"
      :unavailable="ridershipStationUnavailable"
      :ranking="ridershipStationRanking"
      :scope="ridershipStationScope"
      :scope-options="ridershipStationScopeOptions"
      @update:scope="emit('update:scope', $event)"
    />

    <section
      class="global-map-picker-sidebar__line-stats"
      :aria-label="t('globalMap.sidebar.lineProfile')"
    >
      <article class="global-map-picker-sidebar__line-stat">
        <Route :size="17" aria-hidden="true" />
        <div>
          <strong>{{ formatLineLength(lineMetadata?.lengthKm) }}</strong
          ><span>{{ t("globalMap.sidebar.lineStatsLength") }}</span>
        </div>
      </article>
      <article class="global-map-picker-sidebar__line-stat">
        <Train :size="17" aria-hidden="true" />
        <div>
          <strong>{{ lineCount }}</strong
          ><span>{{
            isBikeLine
              ? t("globalMap.sidebar.bikeSegments")
              : t("globalMap.sidebar.lineStatsStations")
          }}</span>
        </div>
      </article>
      <article class="global-map-picker-sidebar__line-stat">
        <Building2 :size="17" aria-hidden="true" />
        <div>
          <strong>{{ servedCitiesPattern.length }}</strong
          ><span>{{ t("globalMap.sidebar.lineStatsCities") }}</span>
        </div>
      </article>
      <article class="global-map-picker-sidebar__line-stat">
        <Shuffle :size="17" aria-hidden="true" />
        <div>
          <strong>{{ lineConnectionCount }}</strong
          ><span>{{ t("globalMap.sidebar.lineStatsConnections") }}</span>
        </div>
      </article>
    </section>

    <section v-if="!isLinePreview" class="global-map-picker-sidebar__line-card global-map-picker-sidebar__nearby-card">
      <div class="global-map-picker-sidebar__line-card-title">
        <span><Building2 :size="16" aria-hidden="true" />{{ t("globalMap.sidebar.nearbyPlaces") }}</span>
        <MaterialCombobox
          :model-value="String(nearbyPlacesRadiusMinutes)"
          :options="nearbyRadiusOptions"
          :aria-label="t('globalMap.sidebar.nearbyPlacesRadiusAria')"
          @update:model-value="updateNearbyRadius"
        />
      </div>
      <p class="global-map-picker-sidebar__nearby-hint">
        {{ t("globalMap.sidebar.nearbyPlacesDescription", { minutes: nearbyPlacesRadiusMinutes }) }}
      </p>
      <p v-if="nearbyPlacesLoading" class="global-map-picker-sidebar__line-empty" role="status">
        {{ t("globalMap.sidebar.nearbyPlacesLoading") }}
      </p>
      <p v-else-if="nearbyPlacesError" class="global-map-picker-sidebar__line-empty" role="status">
        {{ t("globalMap.sidebar.nearbyPlacesUnavailable") }}
      </p>
      <p v-else-if="presentedNearbyPlaces.length === 0" class="global-map-picker-sidebar__line-empty">
        {{ t("globalMap.sidebar.nearbyPlacesEmpty") }}
      </p>
      <ul v-else class="global-map-picker-sidebar__nearby-list">
        <li v-for="entry in presentedNearbyPlaces" :key="entry.place.id">
          <component :is="entry.presentation.icon" :size="16" aria-hidden="true" />
          <span>
            <strong>{{ entry.presentation.name }}</strong>
            <small>{{ entry.presentation.typeLabel }} · {{ t("nearbyStations.walkingTime", { minutes: entry.minutes }) }}</small>
          </span>
        </li>
      </ul>
    </section>

    <section
      v-if="lineMetadata?.firstStation || lineMetadata?.lastStation"
      class="global-map-picker-sidebar__line-card"
    >
      <div class="global-map-picker-sidebar__line-card-title">
        <button
          id="global-map-picker-sidebar-line-route-toggle"
          class="global-map-picker-sidebar__accordion-trigger"
          :class="{ 'global-map-picker-sidebar__accordion-trigger--expanded': itineraryExpanded }"
          type="button"
          aria-controls="global-map-picker-sidebar-line-route"
          :aria-expanded="itineraryExpanded"
          data-testid="global-map-picker-itinerary-toggle"
          @click="itineraryExpanded = !itineraryExpanded"
        >
          <span><Route :size="16" aria-hidden="true" />{{ t("globalMap.sidebar.lineRoute") }}</span>
          <ChevronDown :size="16" aria-hidden="true" />
        </button>
        <small>{{ lineGeometryCount }} {{ t("globalMap.sidebar.lineTraces") }}</small>
      </div>
      <div
        v-if="itineraryExpanded"
        id="global-map-picker-sidebar-line-route"
        role="region"
        aria-labelledby="global-map-picker-sidebar-line-route-toggle"
      >
        <div class="global-map-picker-sidebar__route">
          <div class="global-map-picker-sidebar__route-station">
            <span
              class="global-map-picker-sidebar__route-dot"
              :style="{ backgroundColor: displayLine.color }"
            />
            <div>
              <small>{{ t("globalMap.sidebar.lineDeparture") }}</small
              ><strong>{{ lineMetadata?.firstStation?.name }}</strong
              ><span>{{
                lineMetadata?.firstStation?.city ?? t("globalMap.search.cityFallback")
              }}</span>
            </div>
          </div>
          <div class="global-map-picker-sidebar__route-track">
            <span aria-hidden="true" />
            <small>{{ lineCount }} {{ lineCountLabel }}</small>
          </div>
          <div
            class="global-map-picker-sidebar__route-station global-map-picker-sidebar__route-station--end"
          >
            <span
              class="global-map-picker-sidebar__route-dot"
              :style="{ backgroundColor: displayLine.color }"
            />
            <div>
              <small>{{ t("globalMap.sidebar.lineTerminal") }}</small
              ><strong>{{ lineMetadata?.lastStation?.name }}</strong
              ><span>{{
                lineMetadata?.lastStation?.city ?? t("globalMap.search.cityFallback")
              }}</span>
            </div>
          </div>
        </div>
        <div
          v-if="!isLinePreview && (directionLoading || directionOptions.length > 1)"
          class="global-map-picker-sidebar__directions"
        >
          <div
            v-if="directionLoading && directionOptions.length <= 1"
            class="global-map-picker-sidebar__frequency-loading"
            aria-live="polite"
          >
            <span class="global-map-picker-sidebar__loading-dot" />{{
              t("globalMap.sidebar.lineLoading")
            }}
          </div>
          <template v-else>
            <div class="global-map-picker-sidebar__directions-heading">
              <span class="global-map-picker-sidebar__directions-label">{{
                t("lineMap.sidebar.mainDirections")
              }}</span>
            </div>
            <div
              class="global-map-picker-sidebar__direction-list"
              role="group"
              :aria-label="t('lineMap.sidebar.mainDirections')"
            >
              <button
                class="global-map-picker-sidebar__direction-option"
                :class="{
                  'global-map-picker-sidebar__direction-option--selected': mergeDirections,
                }"
                type="button"
                :aria-pressed="mergeDirections"
                data-testid="global-map-picker-merge-directions"
                @click="emit('toggle-merge-directions')"
              >
                <span>{{ t("lineMap.sidebar.mergeMainDirections") }}</span>
              </button>
              <button
                v-for="direction in directionOptions"
                :key="direction.id"
                class="global-map-picker-sidebar__direction-option"
                :class="{
                  'global-map-picker-sidebar__direction-option--selected':
                    direction.id === selectedMainDirectionId,
                }"
                type="button"
                :aria-pressed="direction.id === selectedMainDirectionId"
                :data-testid="`global-map-picker-main-direction-${direction.id}`"
                @click="emit('change-direction', direction.id)"
              >
                <span>{{ direction.label }}</span>
                <small>{{ direction.stopCount }} {{ t("globalMap.sidebar.stations") }}</small>
              </button>
            </div>
            <details
              v-if="optionalDirectionVariants.length"
              class="global-map-picker-sidebar__direction-variants"
            >
              <summary>
                {{
                  t("lineMap.sidebar.routeVariants", { count: optionalDirectionVariants.length })
                }}
              </summary>
              <div class="global-map-picker-sidebar__direction-list">
                <button
                  v-for="variant in optionalDirectionVariants"
                  :key="variant.id"
                  class="global-map-picker-sidebar__direction-option global-map-picker-sidebar__direction-option--variant"
                  :class="{
                    'global-map-picker-sidebar__direction-option--selected':
                      variant.id === selectedDirectionId,
                  }"
                  type="button"
                  :aria-pressed="variant.id === selectedDirectionId"
                  @click="emit('change-direction-variant', variant.id)"
                >
                  <span>{{ variant.label }}</span>
                  <small>{{ variant.stopCount }} {{ t("globalMap.sidebar.stations") }}</small>
                </button>
              </div>
            </details>
          </template>
        </div>
      </div>
    </section>

    <section class="global-map-picker-sidebar__line-card">
      <div class="global-map-picker-sidebar__line-card-title">
        <button
          id="global-map-picker-sidebar-line-cities-toggle"
          class="global-map-picker-sidebar__accordion-trigger"
          :class="{ 'global-map-picker-sidebar__accordion-trigger--expanded': lineCitiesExpanded }"
          type="button"
          aria-controls="global-map-picker-sidebar-line-cities"
          :aria-expanded="lineCitiesExpanded"
          @click="lineCitiesExpanded = !lineCitiesExpanded"
        >
          <span
            ><Building2 :size="16" aria-hidden="true" />{{
              t("globalMap.sidebar.lineCities")
            }}</span
          >
          <ChevronDown :size="16" aria-hidden="true" />
        </button>
        <small>{{ servedCitiesPattern.length }}</small>
      </div>
      <div
        v-if="lineCitiesExpanded && servedCitiesPattern.length"
        id="global-map-picker-sidebar-line-cities"
        role="region"
        aria-labelledby="global-map-picker-sidebar-line-cities-toggle"
      >
        <CitiesLinePattern
          :cities="servedCitiesPattern"
          :line-color="displayLine.color"
          :line-mode="displayLine.mode"
          :empty-label="t('globalMap.sidebar.lineUnavailable')"
        />
      </div>
      <p v-else-if="lineCitiesExpanded" class="global-map-picker-sidebar__line-empty">
        {{ t("globalMap.sidebar.lineUnavailable") }}
      </p>
    </section>

    <section
      v-if="!isLinePreview && station && entrances.length"
      class="global-map-picker-sidebar__card"
    >
      <div class="global-map-picker-sidebar__card-title">
        <button
          id="global-map-picker-sidebar-entrances-toggle"
          class="global-map-picker-sidebar__accordion-trigger"
          :class="{ 'global-map-picker-sidebar__accordion-trigger--expanded': entrancesExpanded }"
          type="button"
          aria-controls="global-map-picker-sidebar-entrances"
          :aria-expanded="entrancesExpanded"
          @click="entrancesExpanded = !entrancesExpanded"
        >
          <span><MapPinned :size="18" aria-hidden="true" />{{ t("globalMap.sidebar.exits") }}</span>
          <ChevronDown :size="16" aria-hidden="true" />
        </button>
        <small>{{ entrances.length }}</small>
      </div>
      <ul
        v-if="entrancesExpanded"
        id="global-map-picker-sidebar-entrances"
        class="global-map-picker-sidebar__list"
        aria-labelledby="global-map-picker-sidebar-entrances-toggle"
      >
        <li v-for="item in numberedEntrances" :key="item.entrance.id">
          <button
            class="global-map-picker-sidebar__entrance"
            :class="{
              'global-map-picker-sidebar__entrance--focused':
                item.entrance.id === focusedEntranceId,
            }"
            type="button"
            :aria-label="t('globalMap.sidebar.focusEntranceAria', { exit: item.displayCode })"
            :aria-pressed="item.entrance.id === focusedEntranceId"
            :data-entrance-id="item.entrance.id"
            data-testid="global-map-picker-focus-entrance"
            @click="emit('focus-entrance', item.entrance)"
          >
            <strong>{{ t("globalMap.sidebar.exitWithCode", { code: item.displayCode }) }}</strong>
            <span>{{ item.entrance.name }}</span>
          </button>
        </li>
      </ul>
    </section>

    <GtfsFrequencyCard
      :profile="frequencyProfile"
      :line-color="displayLine?.color"
      :station-coordinates="lineMetadata?.stations"
      :loading="frequencyLoading"
      :unavailable="frequencyUnavailable"
      :preview="isLinePreview"
      @modal-open="emit('modal-open', $event)"
    />

    <AnnualRidershipCard
      :line="ridershipLine"
      :loading="ridershipLoading"
      :unavailable="ridershipUnavailable"
      :preview="isLinePreview"
      :ranking="ridershipLineRanking"
      :ranking-subject="modeLabel(displayLine.mode)"
    />

    <section v-if="lineConnectionOptions.length" class="global-map-picker-sidebar__line-card">
      <div class="global-map-picker-sidebar__line-card-title">
        <span
          ><GitBranch :size="16" aria-hidden="true" />{{
            t("globalMap.sidebar.lineConnections")
          }}</span
        >
        <small>{{ lineConnectionOptions.length }}</small>
      </div>
      <div class="global-map-picker-sidebar__connection-list">
        <button
          v-for="connectedLine in lineConnectionOptions"
          :key="connectedLine.id"
          type="button"
          class="global-map-picker-sidebar__connection"
          :disabled="isLinePreview"
          @click="emit('select-line', connectedLine.id)"
        >
          <span
            class="global-map-picker-sidebar__connection-dot"
            :style="{ backgroundColor: connectedLine.color }"
          />
          <strong>{{ connectedLine.label || connectedLine.code }}</strong>
          <small>{{ modeLabel(connectedLine.mode) }}</small>
        </button>
      </div>
    </section>

    <section class="global-map-picker-sidebar__line-provenance">
      <Database :size="15" aria-hidden="true" />
      <span
        >{{ t("globalMap.sidebar.lineData") }} · {{ lineSourceLabels }} · {{ lineGeometryCount }}
        {{ t("globalMap.sidebar.lineTraces") }}</span
      >
    </section>

    <div v-if="!isLinePreview" class="global-map-picker-sidebar__line-actions">
      <button
        type="button"
        class="global-map-picker-sidebar__secondary-action"
        data-global-map-change-line
        :aria-label="t('globalMap.sidebar.changeLineAria')"
        @click="emit('change-line')"
      >
        <Edit2 :size="17" aria-hidden="true" />
        {{ t("globalMap.sidebar.changeLine") }}
      </button>
      <button
        type="button"
        class="global-map-picker-sidebar__secondary-action"
        data-global-map-view-line-schema
        :aria-label="t('globalMap.sidebar.viewSchemaAria')"
        @click="emit('view-line-schema')"
      >
        <GitBranch :size="17" aria-hidden="true" />
        {{ t("globalMap.sidebar.viewSchema") }}
      </button>
    </div>
    <button
      v-if="!isLinePreview"
      class="global-map-picker-sidebar__primary-action global-map-picker-sidebar__line-action"
      type="button"
      @click="emit('select-line', displayLine.id)"
    >
      <Route :size="17" aria-hidden="true" />
      {{ t("globalMap.sidebar.viewLine") }}
    </button>
  </div>
</template>

<style scoped>
.global-map-picker-sidebar__nearby-card {
  gap: 9px;
}
.global-map-picker-sidebar__nearby-card .global-map-picker-sidebar__line-card-title {
  align-items: center;
}
.global-map-picker-sidebar__nearby-card :deep(.material-combobox) {
  min-width: 126px;
  max-width: 150px;
}
.global-map-picker-sidebar__nearby-card :deep(.material-combobox__trigger) {
  min-height: 34px;
  padding: 5px 9px;
}
.global-map-picker-sidebar__nearby-card :deep(.material-combobox__value) {
  font-size: .72rem;
  font-weight: 800;
}
.global-map-picker-sidebar__nearby-hint {
  color: var(--muted, #71809d);
  font-size: .68rem;
  line-height: 1.35;
}
.global-map-picker-sidebar__nearby-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.global-map-picker-sidebar__nearby-list li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: #5146ff;
}
.global-map-picker-sidebar__nearby-list li > span {
  display: grid;
  min-width: 0;
}
.global-map-picker-sidebar__nearby-list strong,
.global-map-picker-sidebar__nearby-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-map-picker-sidebar__nearby-list strong {
  color: var(--ink, #18233f);
  font-size: .72rem;
}
.global-map-picker-sidebar__nearby-list small {
  color: var(--muted, #71809d);
  font-size: .62rem;
}
</style>
