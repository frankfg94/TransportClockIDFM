<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BusFront, Frown, Meh, Smile, TrainFront, TramFront, Volume2, Wind } from "lucide-vue-next";
import { useI18n } from "../../../i18n";
import type { GlobalMapMode } from "../contracts/manifest";
import { worldScaleAtZoom, worldToScreen } from "../geo/coordinateKernel";
import type { CameraState } from "../geo/camera";
import {
  countIrisTransport,
  irisAirNoiseLevelFromScore,
  prepareIrisNeighborhoodGroups,
  prepareIrisNeighborhoods,
  type PreparedIrisNeighborhood,
  type IrisNeighborhoodAirNoise,
  type IrisTransportStation,
} from "../iris/irisGeometry";
import type {
  IrisAirNoiseStatistics,
  IrisNeighborhood,
  IrisSourceMetadata,
} from "../iris/irisApi";

const props = withDefaults(defineProps<{
  neighborhoods: readonly IrisNeighborhood[];
  camera: CameraState;
  transportStations?: readonly IrisTransportStation[];
  airNoiseCommunes?: Readonly<Record<string, IrisAirNoiseStatistics>>;
  airNoiseNeighborhoods?: ReadonlyMap<string, IrisNeighborhoodAirNoise>;
  airNoiseSource?: IrisSourceMetadata;
  scope: "city" | "region";
  /** Keep the IRIS boundaries while suppressing their map fill. */
  showFill?: boolean;
  showSubdivisions?: boolean;
  /** Raw IRIS ids in the order in which the city transition should draw them. */
  revealOrder?: readonly string[];
  /** Normalized progress of the city transition, from 0 to 1. */
  revealProgress?: number;
  /** Precomputed OSM commerce totals keyed by raw IRIS code. */
  commerceCounts?: Readonly<Record<string, number>>;
  /** True once the selected communeâ€™s compiled commerce data is available. */
  commerceDataAvailable?: boolean;
  /** When enabled, use the commerce totals to shade each displayed neighborhood. */
  commerceHighlight?: boolean;
  activityTotals?: Readonly<Record<string, number>>;
  activityLabel?: string;
}>(), {
  transportStations: () => [],
  airNoiseCommunes: () => ({}),
  showFill: true,
  showSubdivisions: false,
  revealOrder: () => [],
  revealProgress: 1,
  commerceCounts: () => ({}),
  commerceDataAvailable: false,
  commerceHighlight: false,
});

interface IrisDisplayItem {
  id: string;
  name: string;
  communeCode: string;
  communeName: string;
  members: readonly IrisNeighborhood[];
  preparedMembers: readonly PreparedIrisNeighborhood[];
  boundaryPath: string;
  centroidWorld: PreparedIrisNeighborhood["centroidWorld"];
}

interface TooltipPosition {
  x: number;
  y: number;
}

const { n, t } = useI18n();
const overlayRoot = ref<HTMLElement>();
const hoveredId = ref<string>();
const tooltipPosition = ref<TooltipPosition>();
const tooltipLocked = ref(false);
let clearTimer: ReturnType<typeof setTimeout> | undefined;

const QUALITY_FACE_ICONS = [Smile, Meh, Frown] as const;

const preparedNeighborhoods = computed(() => prepareIrisNeighborhoods(props.neighborhoods));
const preparedGroups = computed(() => prepareIrisNeighborhoodGroups(props.neighborhoods));
// A single merged group is not useful as a city-level label: it hides every
// source subdivision behind one generic outline (for example "Quartier 1â€¦17").
// Keep the explicit prop authoritative while exposing the raw subdivisions in
// that degenerate grouped result.
const effectiveShowSubdivisions = computed(() => props.showSubdivisions || preparedGroups.value.length === 1);
const displayItems = computed<IrisDisplayItem[]>(() => {
  if (effectiveShowSubdivisions.value) {
    return preparedNeighborhoods.value.map((prepared) => ({
      id: prepared.neighborhood.id,
      name: prepared.neighborhood.name,
      communeCode: prepared.neighborhood.communeCode,
      communeName: prepared.neighborhood.communeName,
      members: [prepared.neighborhood],
      preparedMembers: [prepared],
      boundaryPath: prepared.path,
      centroidWorld: prepared.centroidWorld,
    }));
  }
  return preparedGroups.value.map((prepared) => ({
    id: prepared.group.id,
    name: prepared.group.name,
    communeCode: prepared.group.communeCode,
    communeName: prepared.group.communeName,
    members: prepared.group.neighborhoods,
    preparedMembers: prepared.neighborhoods,
    boundaryPath: prepared.boundaryPath,
    centroidWorld: prepared.centroidWorld,
    }));
});
const revealRankByNeighborhoodId = computed(() => new Map(
  props.revealOrder.map((id, index) => [id, index] as const),
));
const revealActive = computed(() => props.revealOrder.length > 0 && props.revealProgress < 1);
const commerceCountByItem = computed(() => new Map(
  displayItems.value.map((item) => [item.id, item.members.reduce((sum, member) => sum + (props.commerceCounts[member.codeIris] ?? 0), 0)] as const),
));
const activityRateByItem = computed(() => new Map(displayItems.value.map((item) => {
  const total = item.members.reduce((sum, member) => sum + (props.activityTotals?.[member.codeIris] ?? 0), 0);
  return [item.id, total ? (commerceCountByItem.value.get(item.id) ?? 0) / total : 0] as const;
})));
const commerceMaximum = computed(() => Math.max(1, ...commerceCountByItem.value.values()));
const detailedTransportCounts = computed(() => countIrisTransport(props.neighborhoods, props.transportStations));
const transportCounts = computed(() => {
  const counts = new Map<string, { stationCount: number; lineCount: number; modes: Partial<Record<GlobalMapMode, number>> }>();
  for (const item of displayItems.value) {
    const aggregate = { stationCount: 0, lineCount: 0, modes: {} as Partial<Record<GlobalMapMode, number>> };
    for (const member of item.members) {
      const memberCounts = detailedTransportCounts.value.get(member.id);
      if (!memberCounts) continue;
      aggregate.stationCount += memberCounts.stationCount;
      aggregate.lineCount += memberCounts.lineCount;
      for (const [mode, count] of Object.entries(memberCounts.modes) as [GlobalMapMode, number][]) {
        aggregate.modes[mode] = (aggregate.modes[mode] ?? 0) + count;
      }
    }
    counts.set(item.id, aggregate);
  }
  return counts;
});
const hoveredItem = computed(() => displayItems.value.find((item) => item.id === hoveredId.value));
const hoveredCounts = computed(() => hoveredId.value ? transportCounts.value.get(hoveredId.value) : undefined);
const hoveredCommerceCount = computed(() => hoveredId.value ? commerceCountByItem.value.get(hoveredId.value) : undefined);
const hoveredAirNoise = computed(() => {
  const item = hoveredItem.value;
  if (!item) return undefined;
  if (props.airNoiseNeighborhoods) {
    const statistics = item.members
      .map((member) => props.airNoiseNeighborhoods!.get(member.id))
      .filter((entry): entry is IrisNeighborhoodAirNoise => Boolean(entry));
    if (statistics.length) return aggregateAirNoise(statistics);
  }
  return props.airNoiseCommunes?.[item.communeCode];
});
const hoveredAirNoiseClass = computed(() => {
  const statistics = hoveredAirNoise.value;
  const value = statistics?.dominantClass;
  if (!statistics || !value || !/^[123][123]$/u.test(value)) return undefined;
  if (!Number.isFinite(statistics.airScore) || !Number.isFinite(statistics.noiseScore)) return undefined;
  return {
    code: value,
    noise: irisAirNoiseLevelFromScore(statistics.noiseScore),
    air: irisAirNoiseLevelFromScore(statistics.airScore),
    noiseScore: statistics.noiseScore,
    airScore: statistics.airScore,
    cellCount: "cellCount" in statistics ? statistics.cellCount : undefined,
  };
});
const modeEntries = computed(() => {
  const counts = hoveredCounts.value?.modes ?? {};
  return IRIS_MODE_ORDER
    .filter((mode) => (counts[mode] ?? 0) > 0)
    .map((mode) => ({ mode, count: counts[mode]! }));
});
const cameraTransform = computed(() => {
  const scale = worldScaleAtZoom(props.camera.zoom);
  return `translate(${props.camera.viewportWidthCssPx / 2 - props.camera.centerWorldX * scale} ${props.camera.viewportHeightCssPx / 2 - props.camera.centerWorldY * scale}) scale(${scale})`;
});
const labelFontSize = computed(() => Math.max(0.000001, Math.min(0.00065, 14 / worldScaleAtZoom(props.camera.zoom))));
const labelStrokeWidth = computed(() => Math.max(0.00000001, 2 / worldScaleAtZoom(props.camera.zoom)));
const tooltipStyle = computed(() => {
  const item = hoveredItem.value;
  if (!item) return undefined;
  const point = props.scope === "city"
    ? tooltipPosition.value ?? worldToScreen(item.centroidWorld, props.camera)
    : worldToScreen(item.centroidWorld, props.camera);
  const width = props.camera.viewportWidthCssPx;
  const height = props.camera.viewportHeightCssPx;
  return {
    left: `${Math.max(12, Math.min(width - 12, point.x))}px`,
    top: `${Math.max(12, Math.min(height - 12, point.y))}px`,
  };
});

const IRIS_MODE_ORDER: GlobalMapMode[] = ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BUS", "NOCTILIEN", "BIKE"];

function modeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "BUS": return t("globalMap.modes.bus");
    case "METRO": return t("globalMap.modes.metro");
    case "RER": return t("globalMap.modes.rer");
    case "TRAIN": return t("globalMap.modes.train");
    case "TRANSILIEN": return t("globalMap.modes.transilien");
    case "TRAM": return t("globalMap.modes.tram");
    case "CABLE": return t("globalMap.modes.cable");
    case "NOCTILIEN": return t("globalMap.modes.noctilien");
    case "BIKE": return t("globalMap.modes.bike");
  }
}

function modeIcon(mode: GlobalMapMode) {
  if (mode === "BUS" || mode === "NOCTILIEN") return BusFront;
  if (mode === "TRAM") return TramFront;
  return TrainFront;
}

function aggregateAirNoise(statistics: readonly IrisNeighborhoodAirNoise[]): IrisNeighborhoodAirNoise {
  const cellCount = statistics.reduce((sum, entry) => sum + entry.cellCount, 0);
  const weight = (entry: IrisNeighborhoodAirNoise): number => entry.cellCount / cellCount;
  const dominantClass = [...statistics]
    .sort((left, right) => right.cellCount - left.cellCount || left.dominantClass.localeCompare(right.dominantClass))[0]!
    .dominantClass;
  return {
    airScore: statistics.reduce((sum, entry) => sum + entry.airScore * weight(entry), 0),
    noiseScore: statistics.reduce((sum, entry) => sum + entry.noiseScore * weight(entry), 0),
    dominantClass,
    cellCount,
  };
}

function qualityFaceIcon(level: number) {
  return QUALITY_FACE_ICONS[level - 1] ?? Meh;
}

function localPointerPosition(event: MouseEvent): TooltipPosition | undefined {
  const target = event.currentTarget;
  const svg = target instanceof SVGElement ? target.ownerSVGElement : overlayRoot.value?.querySelector("svg");
  const bounds = svg?.getBoundingClientRect() ?? overlayRoot.value?.getBoundingClientRect();
  if (!bounds) return undefined;

  const viewportWidth = props.camera.viewportWidthCssPx;
  const viewportHeight = props.camera.viewportHeightCssPx;
  const scaleX = bounds.width > 0 ? viewportWidth / bounds.width : 1;
  const scaleY = bounds.height > 0 ? viewportHeight / bounds.height : 1;
  return {
    x: Math.max(0, Math.min(viewportWidth, (event.clientX - bounds.left) * scaleX)),
    y: Math.max(0, Math.min(viewportHeight, (event.clientY - bounds.top) * scaleY)),
  };
}

function setHovered(id: string, event?: MouseEvent): void {
  if (tooltipLocked.value) return;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = undefined;
  hoveredId.value = id;
  const position = event ? localPointerPosition(event) : undefined;
  if (props.scope === "city" && position) tooltipPosition.value = position;
}

function lockHovered(id: string, event: MouseEvent): void {
  if (props.scope !== "city") return;
  event.stopPropagation();
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = undefined;
  hoveredId.value = id;
  tooltipPosition.value = localPointerPosition(event) ?? tooltipPosition.value;
  tooltipLocked.value = true;
}

function unlockTooltip(): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = undefined;
  tooltipLocked.value = false;
  hoveredId.value = undefined;
  tooltipPosition.value = undefined;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!tooltipLocked.value) return;
  const target = event.target;
  if (target instanceof Node && overlayRoot.value?.contains(target)) return;
  unlockTooltip();
}

function cancelClearHovered(): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = undefined;
}

function scheduleClearHovered(id: string): void {
  if (tooltipLocked.value) return;
  cancelClearHovered();
  clearTimer = setTimeout(() => {
    if (hoveredId.value === id) {
      hoveredId.value = undefined;
      tooltipPosition.value = undefined;
    }
    clearTimer = undefined;
  }, 160);
}

function scheduleClearHoveredTooltip(): void {
  if (hoveredId.value) scheduleClearHovered(hoveredId.value);
}

function itemRevealProgress(item: IrisDisplayItem): number {
  if (!revealActive.value) return 1;
  const ranks = item.members
    .map((member) => revealRankByNeighborhoodId.value.get(member.id))
    .filter((rank): rank is number => rank !== undefined);
  if (ranks.length === 0) return 0;

  // A short overlap between two neighbouring paths makes the reveal feel like
  // a living wave instead of a sequence of unrelated dash animations.
  const firstRank = Math.min(...ranks);
  const wavePosition = Math.max(0, Math.min(1, props.revealProgress)) * props.revealOrder.length;
  return Math.max(0, Math.min(1, (wavePosition - firstRank) / 1.65));
}

function irisRevealStyle(item: IrisDisplayItem): Record<string, string> | undefined {
  if (!revealActive.value) return undefined;
  const progress = itemRevealProgress(item);
  return {
    fillOpacity: `${0.11 * progress}`,
    strokeDasharray: "1",
    strokeDashoffset: `${1 - progress}`,
  };
}

function irisShapeStyle(item: IrisDisplayItem): Record<string, string> | undefined {
  const revealStyle = irisRevealStyle(item);
  const commerceCount = commerceCountByItem.value.get(item.id) ?? 0;
  const commerceStyle: Record<string, string> = props.commerceHighlight
    ? {
        fill: `hsl(${Math.round(142 - ((props.activityTotals ? (activityRateByItem.value.get(item.id) ?? 0) : Math.min(1, commerceCount / commerceMaximum.value)) * 112))} 78% 46%)`,
        fillOpacity: `${0.16 + ((props.activityTotals ? (activityRateByItem.value.get(item.id) ?? 0) : Math.min(1, commerceCount / commerceMaximum.value)) * 0.48)}`,
      }
    : {};
  if (!props.showFill) return { ...commerceStyle, ...revealStyle, fill: "none", fillOpacity: "0" };
  if (Object.keys(commerceStyle).length || revealStyle) return { ...commerceStyle, ...revealStyle };
  return undefined;
}

function irisLabelStyle(item: IrisDisplayItem): Record<string, string> | undefined {
  if (!revealActive.value) return undefined;
  return { opacity: `${itemRevealProgress(item)}` };
}

watch(() => props.scope, (scope) => {
  if (scope !== "city") unlockTooltip();
});

onMounted(() => document.addEventListener("pointerdown", handleDocumentPointerDown));
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  unlockTooltip();
});
</script>

<template>
  <div
    ref="overlayRoot"
    class="iris-neighborhood-overlay"
    :class="[
      `iris-neighborhood-overlay--${scope}`,
      {
        'iris-neighborhood-overlay--hovered': Boolean(hoveredItem),
        'iris-neighborhood-overlay--revealing': revealActive,
      },
    ]"
    data-iris-overlay
    :aria-label="t('globalMap.iris.layerAria')"
  >
    <svg
      class="iris-neighborhood-overlay__svg"
      :style="{ width: `${camera.viewportWidthCssPx}px`, height: `${camera.viewportHeightCssPx}px` }"
      :viewBox="`0 0 ${camera.viewportWidthCssPx} ${camera.viewportHeightCssPx}`"
      preserveAspectRatio="xMinYMin meet"
      role="group"
    >
      <g :transform="cameraTransform">
        <g v-for="item in displayItems" :key="item.id" class="iris-neighborhood-overlay__item">
          <path
            v-for="member in item.preparedMembers"
            :key="member.neighborhood.id"
            class="iris-neighborhood-overlay__shape"
            :class="{
              'iris-neighborhood-overlay__shape--hovered': item.id === hoveredId,
              'iris-neighborhood-overlay__shape--grouped-member': !effectiveShowSubdivisions,
              'iris-neighborhood-overlay__shape--commerce': commerceHighlight,
            }"
            :d="member.path"
            path-length="1"
            :style="irisShapeStyle(item)"
            fill-rule="evenodd"
            :aria-label="effectiveShowSubdivisions ? member.neighborhood.name : item.name"
            :data-iris-code="member.neighborhood.codeIris"
            :data-iris-neighborhood="scope === 'city' ? item.id : undefined"
            @pointerenter="setHovered(item.id, $event)"
            @pointermove="setHovered(item.id, $event)"
            @pointerleave="scheduleClearHovered(item.id)"
            @click="lockHovered(item.id, $event)"
          />
          <path
            v-if="item.boundaryPath"
            class="iris-neighborhood-overlay__group-boundary"
            :class="{ 'iris-neighborhood-overlay__group-boundary--hovered': item.id === hoveredId }"
            :d="item.boundaryPath"
            path-length="1"
            :style="irisRevealStyle(item)"
            aria-hidden="true"
          />
        </g>
        <text
          v-for="item in displayItems"
          :key="`${item.id}:label`"
          class="iris-neighborhood-overlay__label"
          :class="{ 'iris-neighborhood-overlay__label--hovered': item.id === hoveredId }"
          :x="item.centroidWorld.x"
          :y="item.centroidWorld.y"
          :font-size="labelFontSize"
          :stroke-width="labelStrokeWidth"
          :style="irisLabelStyle(item)"
          text-anchor="middle"
          dominant-baseline="middle"
        >{{ item.name }}</text>
      </g>
    </svg>
  </div>

  <!--
    The tooltip is a sibling of the overlay, not a child: the overlay clips its
    overflow to hide the neighbourhood geometry and its own z-index opens a
    stacking context, so a nested tooltip could neither escape the clip at the
    map edges nor paint above the station, place and comparison layers.
  -->

  <aside
    v-if="hoveredItem && hoveredCounts && tooltipStyle"
    class="iris-neighborhood-overlay__tooltip nearby-map__iris-tooltip-layer"
    :class="{ 'iris-neighborhood-overlay__tooltip--locked': tooltipLocked }"
    :style="tooltipStyle"
    role="tooltip"
    :data-tooltip-locked="tooltipLocked ? 'true' : 'false'"
    @pointerenter="cancelClearHovered"
    @pointerleave="scheduleClearHoveredTooltip"
  >
    <strong>{{ hoveredItem.name }}</strong>
    <span>{{ hoveredItem.communeName }}</span>
    <small v-if="hoveredItem.members.length > 1">
      {{ t("globalMap.iris.subdivisionsCount", { count: hoveredItem.members.length }) }}
    </small>
    <small v-else>{{ t("globalMap.iris.tooltipCode", { code: hoveredItem.members[0]?.codeIris ?? "" }) }}</small>
    <div v-if="modeEntries.length" class="iris-neighborhood-overlay__modes">
      <span v-for="entry in modeEntries" :key="entry.mode" :title="modeLabel(entry.mode)">
        <component :is="modeIcon(entry.mode)" :size="13" :stroke-width="2.3" aria-hidden="true" />
        <b>{{ entry.count }}</b>
        <em>{{ modeLabel(entry.mode) }}</em>
      </span>
    </div>
    <span v-else class="iris-neighborhood-overlay__empty">
      {{ t("globalMap.iris.noTransport") }}
    </span>
    <small>{{ t("globalMap.iris.tooltipStations", { count: hoveredCounts.stationCount }) }}</small>
    <small v-if="commerceDataAvailable && hoveredCommerceCount !== undefined" class="iris-neighborhood-overlay__commerce-count">
      {{ activityLabel ? `${activityLabel} : ${n(hoveredCommerceCount)}` : t("globalMap.iris.tooltipCommerce", { count: n(hoveredCommerceCount) }) }}
    </small>
    <div v-if="hoveredAirNoise && hoveredAirNoiseClass" class="iris-neighborhood-overlay__environment">
      <span
        class="iris-neighborhood-overlay__environment-item iris-neighborhood-overlay__environment-item--noise"
        role="img"
        :aria-label="t('globalMap.iris.noiseScoreAccessible', { level: hoveredAirNoiseClass.noise })"
        :title="t('globalMap.iris.noiseScoreTitle')"
      >
        <Volume2 :size="15" :stroke-width="2.3" aria-hidden="true" />
        <em>{{ t("globalMap.iris.noiseScore") }}</em>
        <strong class="iris-neighborhood-overlay__environment-score">{{ t("globalMap.iris.environmentScore", { score: n(hoveredAirNoiseClass.noiseScore, { maximumFractionDigits: 1 }) }) }}</strong>
        <span class="iris-neighborhood-overlay__environment-faces" aria-hidden="true">
          <component
            v-for="faceLevel in 3"
            :is="qualityFaceIcon(faceLevel)"
            :key="`noise-face-${faceLevel}`"
            class="iris-neighborhood-overlay__environment-face"
            :class="[
              `iris-neighborhood-overlay__environment-face--${faceLevel}`,
              { 'iris-neighborhood-overlay__environment-face--selected': faceLevel === hoveredAirNoiseClass.noise },
            ]"
            :data-quality-level="faceLevel"
            :size="15"
            :stroke-width="2.2"
          />
        </span>
      </span>
        <span
          class="iris-neighborhood-overlay__environment-item iris-neighborhood-overlay__environment-item--air"
          role="img"
          :aria-label="t('globalMap.iris.airScoreAccessible', { level: hoveredAirNoiseClass.air })"
          :title="t('globalMap.iris.airScoreTitle')"
        >
          <Wind :size="15" :stroke-width="2.3" aria-hidden="true" />
          <em>{{ t("globalMap.iris.airScore") }}</em>
          <strong class="iris-neighborhood-overlay__environment-score">{{ t("globalMap.iris.environmentScore", { score: n(hoveredAirNoiseClass.airScore, { maximumFractionDigits: 1 }) }) }}</strong>
          <span class="iris-neighborhood-overlay__environment-faces" aria-hidden="true">
            <component
              v-for="faceLevel in 3"
              :is="qualityFaceIcon(faceLevel)"
              :key="`air-face-${faceLevel}`"
              class="iris-neighborhood-overlay__environment-face"
              :class="[
                `iris-neighborhood-overlay__environment-face--${faceLevel}`,
                { 'iris-neighborhood-overlay__environment-face--selected': faceLevel === hoveredAirNoiseClass.air },
              ]"
              :data-quality-level="faceLevel"
              :size="15"
              :stroke-width="2.2"
            />
          </span>
        </span>
        <small v-if="hoveredAirNoiseClass.cellCount !== undefined" class="iris-neighborhood-overlay__environment-coverage">
          {{ t("globalMap.iris.environmentCoverage", { count: n(hoveredAirNoiseClass.cellCount, { maximumFractionDigits: 0 }) }) }}
        </small>
      </div>
      <span v-else class="iris-neighborhood-overlay__environment-empty">
        {{ t("globalMap.iris.airNoiseUnavailable") }}
      </span>
      <a
        v-if="hoveredAirNoise && airNoiseSource?.pageUrl"
        class="iris-neighborhood-overlay__source-link"
        :href="airNoiseSource.pageUrl"
        target="_blank"
        rel="noopener noreferrer"
      >{{ t("globalMap.iris.sources") }}</a>
    </aside>
    <aside v-else class="iris-neighborhood-overlay__commerce-legend" aria-live="polite">
      <strong>{{ activityLabel ? t("nearbyStations.cityActivity.legend", { activity: activityLabel }) : t("nearbyStations.cityCommerceLegend") }}</strong>
      <span><i class="iris-neighborhood-overlay__commerce-dot iris-neighborhood-overlay__commerce-dot--low" />{{ t("nearbyStations.cityCommerceLow") }}</span>
      <span><i class="iris-neighborhood-overlay__commerce-dot iris-neighborhood-overlay__commerce-dot--high" />{{ t("nearbyStations.cityCommerceHigh") }}</span>
    </aside>
</template>

<style scoped>
.iris-neighborhood-overlay {
  position: absolute;
  /* Keep IRIS geometry above the raster basemap. Without an explicit level,
     the positioned z-index:0 basemap can paint over the SVG contours while
     its pointer targets still remain reachable through pointer-events:none. */
  z-index: 4;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.iris-neighborhood-overlay--city-fade-out {
  animation: iris-neighborhood-city-fade-out var(--nearby-city-transition-duration, 980ms) cubic-bezier(.65, 0, .35, 1) both;
  will-change: opacity;
}
.iris-neighborhood-overlay--city-fade-in {
  animation: iris-neighborhood-city-fade-in var(--nearby-city-transition-duration, 980ms) cubic-bezier(.65, 0, .35, 1) both;
  will-change: opacity;
}
.iris-neighborhood-overlay__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.iris-neighborhood-overlay__shape {
  fill: #7c3aed;
  fill-opacity: .11;
  stroke: #6d28d9;
  stroke-width: 1.2;
  stroke-opacity: .68;
  vector-effect: non-scaling-stroke;
  pointer-events: visiblePainted;
  cursor: crosshair;
  transition: fill-opacity 120ms ease, stroke-opacity 120ms ease;
}
.iris-neighborhood-overlay--city .iris-neighborhood-overlay__shape {
  /* The whole current-city polygon is a drag surface, even when its fill is
     hidden by an active isochrone layer. */
  pointer-events: all;
}
.iris-neighborhood-overlay__shape--grouped-member {
  stroke-opacity: 0;
}
.iris-neighborhood-overlay__group-boundary {
  fill: none;
  stroke: #6d28d9;
  stroke-width: 1.35;
  stroke-opacity: .68;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
  transition: stroke-opacity 120ms ease, stroke-width 120ms ease;
}
.iris-neighborhood-overlay__group-boundary--hovered {
  stroke: #b45309;
  stroke-opacity: .95;
  stroke-width: 2;
}
.iris-neighborhood-overlay--region .iris-neighborhood-overlay__shape {
  fill-opacity: .075;
  stroke-opacity: .5;
}
.iris-neighborhood-overlay--region .iris-neighborhood-overlay__shape--grouped-member,
.iris-neighborhood-overlay--region .iris-neighborhood-overlay__shape--grouped-member.iris-neighborhood-overlay__shape--hovered {
  stroke-opacity: 0;
}
.iris-neighborhood-overlay__shape:hover,
.iris-neighborhood-overlay__shape--hovered {
  fill: #f59e0b !important;
  fill-opacity: .28 !important;
  stroke: #b45309;
  stroke-opacity: .95;
  stroke-width: 2;
}
.iris-neighborhood-overlay__shape--commerce {
  transition: fill 160ms ease, fill-opacity 160ms ease, stroke-opacity 120ms ease;
}
.iris-neighborhood-overlay__shape--grouped-member.iris-neighborhood-overlay__shape--hovered {
  stroke-opacity: 0;
}
.iris-neighborhood-overlay--region .iris-neighborhood-overlay__group-boundary {
  stroke-opacity: .5;
}
.iris-neighborhood-overlay--region .iris-neighborhood-overlay__group-boundary--hovered {
  stroke-opacity: .95;
}
.iris-neighborhood-overlay__label {
  fill: #32145f;
  fill-opacity: .94;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-weight: 850;
  paint-order: stroke fill;
  stroke: rgba(255, 255, 255, .96);
  pointer-events: none;
  user-select: none;
}
.iris-neighborhood-overlay__label--hovered {
  fill: #1f2937;
  fill-opacity: 1;
  stroke: #fff;
  stroke-opacity: 1;
}
.iris-neighborhood-overlay--revealing .iris-neighborhood-overlay__shape,
.iris-neighborhood-overlay--revealing .iris-neighborhood-overlay__group-boundary {
  transition: none;
}
.iris-neighborhood-overlay--revealing .iris-neighborhood-overlay__label {
  transition: opacity 120ms linear;
}
@keyframes iris-neighborhood-city-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes iris-neighborhood-city-fade-in { from { opacity: 0; } to { opacity: 1; } }
.iris-neighborhood-overlay__tooltip {
  position: absolute;
  /* The tooltip is a sibling of the overlay so it can win over the station,
     place and comparison layers. Its level is owned by the host map, which
     knows the layer order. */
  z-index: 1;
  display: grid;
  gap: 3px;
  min-width: 168px;
  max-width: min(260px, calc(100% - 24px));
  padding: 9px 11px;
  border: 1px solid rgba(124, 58, 237, .3);
  border-radius: 11px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .2);
  color: #1f2937;
  font-size: .72rem;
  transform: translate(-50%, calc(-100% - 14px));
  pointer-events: auto;
}
.iris-neighborhood-overlay__tooltip strong {
  color: #3b1d70;
  font-size: .82rem;
}
.iris-neighborhood-overlay__tooltip > span,
.iris-neighborhood-overlay__tooltip small {
  color: #64748b;
  font-size: .66rem;
}
.iris-neighborhood-overlay__commerce-count {
  color: #166534 !important;
  font-weight: 850;
}
.iris-neighborhood-overlay__commerce-legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  gap: 4px;
  min-width: 150px;
  padding: 8px 10px;
  border: 1px solid rgba(22, 101, 52, .18);
  border-radius: 10px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 6px 18px rgba(15, 23, 42, .14);
  color: #334155;
  font-size: .64rem;
  pointer-events: auto;
}
.iris-neighborhood-overlay__commerce-legend strong {
  color: #166534;
  font-size: .68rem;
}
.iris-neighborhood-overlay__commerce-legend span {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}
.iris-neighborhood-overlay__commerce-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 3px;
}
.iris-neighborhood-overlay__commerce-dot--low { background: hsl(142 78% 46%); opacity: .45; }
.iris-neighborhood-overlay__commerce-dot--high { background: hsl(30 78% 46%); }
.iris-neighborhood-overlay__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  margin-top: 4px;
}
.iris-neighborhood-overlay__modes span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #334155;
}
.iris-neighborhood-overlay__modes b {
  color: #3b1d70;
}
.iris-neighborhood-overlay__modes em {
  font-size: .6rem;
  font-style: normal;
}
.iris-neighborhood-overlay__empty {
  margin-top: 3px;
  color: #92400e !important;
}
.iris-neighborhood-overlay__environment {
  display: grid;
  gap: 4px;
  margin-top: 5px;
}
.iris-neighborhood-overlay__environment > span {
  align-items: center;
  display: flex;
  gap: 5px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid rgba(100, 116, 139, .2);
  border-radius: 8px;
  background: rgba(248, 250, 252, .88);
}
.iris-neighborhood-overlay__environment-item > svg:first-child {
  flex: 0 0 auto;
  color: #64748b;
}
.iris-neighborhood-overlay__environment em {
  min-width: 0;
  color: #334155;
  flex: 1 1 auto;
  font-size: .6rem;
  font-style: normal;
  line-height: 1.1;
}
.iris-neighborhood-overlay__environment-score {
  flex: 0 0 auto;
  color: #3b1d70 !important;
  font-size: .64rem !important;
  white-space: nowrap;
}
.iris-neighborhood-overlay__environment-coverage {
  color: #64748b;
  font-size: .59rem;
  padding-left: 4px;
}
.iris-neighborhood-overlay__environment-faces {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
}
.iris-neighborhood-overlay__environment-face {
  height: 15px;
  width: 15px;
}
.iris-neighborhood-overlay__environment-face--1 {
  color: #16a34a;
  opacity: .3;
}
.iris-neighborhood-overlay__environment-face--2 {
  color: #64748b;
  opacity: .48;
}
.iris-neighborhood-overlay__environment-face--3 {
  color: #dc2626;
  opacity: .3;
}
.iris-neighborhood-overlay__environment-face--selected {
  opacity: 1;
}
.iris-neighborhood-overlay__environment-empty {
  margin-top: 4px;
  color: #92400e !important;
  font-size: .64rem !important;
}
.iris-neighborhood-overlay__source-link {
  justify-self: end;
  color: #64748b;
  font-size: .61rem;
  pointer-events: auto;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.iris-neighborhood-overlay__source-link:hover,
.iris-neighborhood-overlay__source-link:focus-visible {
  color: #3b1d70;
}
@media (prefers-reduced-motion: reduce) {
  .iris-neighborhood-overlay--city-fade-out,
  .iris-neighborhood-overlay--city-fade-in { animation: none; }
  .iris-neighborhood-overlay__shape { transition: none; }
}
</style>
