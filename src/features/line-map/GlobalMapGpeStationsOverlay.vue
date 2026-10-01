<script setup lang="ts">
import { computed, ref } from "vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation } from "../../services/linePresentation";
import type { CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../transport-map/geo/coordinateKernel";
import type { GpeMapStation } from "../transport-map/gpeStationsApi";

const props = defineProps<{
  stations: readonly GpeMapStation[];
  camera: CameraState;
}>();

const { t } = useI18n();
const hoveredStationId = ref<string>();
const focusedStationId = ref<string>();
const highlightedStationId = computed(() => hoveredStationId.value ?? focusedStationId.value);

const displayedStations = computed(() => props.stations
  .map((station) => ({
    station,
    lineBadge: createGpeLineBadge(station.line),
    point: worldToScreen(lonLatToWorld(station), props.camera),
  }))
  .filter(({ point }) => point.x >= -20
    && point.x <= props.camera.viewportWidthCssPx + 20
    && point.y >= -20
    && point.y <= props.camera.viewportHeightCssPx + 20));

function createGpeLineBadge(line: string) {
  const lineCode = line.trim();
  const id = `gpe:${lineCode}`;
  const presentation = createLinePresentation({
    code: lineCode,
    family: "METRO",
    id,
    mode: "metro",
    ref: id,
    shortName: lineCode,
  });

  return {
    ...presentation,
    family: "METRO" as const,
    id,
    label: lineCode,
    mode: "metro" as const,
    ref: id,
    shortName: lineCode,
  };
}

function statusLabel(status: GpeMapStation["projectStatus"]): string {
  return t(`globalMap.gpeStations.status.${status}` as never);
}

function stationAriaLabel(station: GpeMapStation): string {
  return t("globalMap.gpeStations.stationAria", {
    name: station.name,
    line: station.line,
    status: statusLabel(station.projectStatus),
  });
}
</script>

<template>
  <div
    v-if="displayedStations.length"
    class="global-map-gpe-stations-overlay"
    data-testid="global-map-gpe-stations"
    role="group"
    :aria-label="t('globalMap.gpeStations.groupAria')"
  >
    <button
      v-for="entry in displayedStations"
      :key="entry.station.id"
      class="global-map-gpe-station"
      :class="`global-map-gpe-station--${entry.station.projectStatus}`"
      :style="{ left: `${entry.point.x}px`, top: `${entry.point.y}px` }"
      type="button"
      :aria-label="stationAriaLabel(entry.station)"
      @focus="focusedStationId = entry.station.id"
      @blur="focusedStationId = undefined"
      @mouseenter="hoveredStationId = entry.station.id"
      @mouseleave="hoveredStationId = undefined"
    >
      <span class="global-map-gpe-station__marker" aria-hidden="true">
        <LineIconBadge :line="entry.lineBadge" compact eager />
      </span>
      <span
        v-if="highlightedStationId === entry.station.id"
        class="global-map-gpe-station__tooltip"
        role="tooltip"
      >
        <strong>{{ entry.station.name }}</strong>
        <span>{{ t("globalMap.gpeStations.line", { line: entry.station.line }) }}</span>
        <small>{{ statusLabel(entry.station.projectStatus) }}</small>
      </span>
    </button>
  </div>
</template>

<style scoped>
.global-map-gpe-stations-overlay {
  position: absolute;
  z-index: 4;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.global-map-gpe-station {
  position: absolute;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  transform: translate(-50%, -50%);
  transition: transform 120ms ease;
}

.global-map-gpe-station__marker {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--gpe-station-status-color, #7353ba);
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 6px rgba(15, 23, 42, .42);
  transition: transform 120ms ease;
}

.global-map-gpe-station--under-construction {
  --gpe-station-status-color: #d97706;
}

.global-map-gpe-station--open {
  --gpe-station-status-color: #15803d;
}

.global-map-gpe-station:hover,
.global-map-gpe-station:focus-visible {
  z-index: 2;
  outline: 2px solid rgba(255, 255, 255, .92);
  outline-offset: 2px;
  background: transparent;
  color: inherit;
  transform: translate(-50%, -50%);
}

.global-map-gpe-station:hover .global-map-gpe-station__marker,
.global-map-gpe-station:focus-visible .global-map-gpe-station__marker {
  transform: scale(1.18);
}

.global-map-gpe-station :deep(.line-icon-badge) {
  width: 18px;
  min-width: 18px;
  height: 18px;
  justify-content: center;
}

.global-map-gpe-station :deep(.line-icon-badge img) {
  max-width: 18px;
  max-height: 18px;
}

.global-map-gpe-station :deep(.line-icon-badge__fallback) {
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
}

.global-map-gpe-station :deep(.line-icon-badge__label) {
  min-width: 16px;
  padding: 0;
  font-size: .55rem;
}

.global-map-gpe-station__tooltip {
  position: absolute;
  z-index: 3;
  left: 13px;
  bottom: 13px;
  display: grid;
  gap: 2px;
  min-width: 142px;
  max-width: min(240px, 70vw);
  padding: 7px 9px;
  border: 1px solid rgba(15, 23, 42, .12);
  border-radius: 8px;
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 5px 16px rgba(15, 23, 42, .2);
  color: #172033;
  font-size: .7rem;
  line-height: 1.25;
  text-align: left;
  white-space: normal;
  pointer-events: none;
}

.global-map-gpe-station__tooltip strong {
  font-size: .74rem;
}

.global-map-gpe-station__tooltip small {
  color: #5d6678;
}

@media (prefers-reduced-motion: reduce) {
  .global-map-gpe-station,
  .global-map-gpe-station__marker {
    transition: none;
  }
}
</style>
