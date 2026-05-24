<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  isBusTransfer,
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
} from "./lineMapData";
import type {
  LineSearchOption,
  StationSearchOption,
  TransferLineOption,
} from "../../types/transit";
import type {
  LineMapSegmentView,
  LineMapStopView,
  LineMapViewModel,
  TransferLineDirections,
} from "./types";
import "./line-map.css";

interface TransferState {
  loading: boolean;
  lines: TransferLineOption[];
  error?: string;
}

interface DirectionState {
  loading: boolean;
  directions: string[];
  error?: string;
}

const props = defineProps<{
  line?: LineSearchOption;
  selectedStationId?: string;
  mode?: "picker" | "explorer";
  selectable?: boolean;
}>();

const emit = defineEmits<{
  select: [station: StationSearchOption];
}>();

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const SVG_PADDING_X = 78;
const SVG_PADDING_Y = 68;
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 0.22;

const lineMap = ref<LineMapViewModel>();
const loadingMap = ref(false);
const errorMessage = ref("");
const hoveredStop = ref<LineMapStopView>();
const zoom = ref(1.12);
const activeTransfer = ref<TransferLineOption>();
const transferStates = reactive<Record<string, TransferState>>({});
const directionStates = reactive<Record<string, DirectionState>>({});
let latestMapRequest = 0;
let clearHoverTimer: number | undefined;
let clearTransferTimer: number | undefined;

const stopById = computed(() => {
  const stops = new Map<string, LineMapStopView>();

  lineMap.value?.stops.forEach((stop) => stops.set(stop.id, stop));

  return stops;
});

const selectedStop = computed(() =>
  lineMap.value?.stops.find((stop) => stop.id === props.selectedStationId),
);

const hoveredTransferState = computed(() =>
  hoveredStop.value ? transferStates[hoveredStop.value.id] : undefined,
);

const activeDirectionState = computed(() =>
  activeTransfer.value ? directionStates[activeTransfer.value.id] : undefined,
);
const isExplorerMode = computed(() => props.mode === "explorer");
const canSelectStops = computed(() => props.selectable !== false);

const mapStats = computed(() => {
  const stopCount = lineMap.value?.stops.length ?? 0;

  return `${stopCount} stations`;
});

const svgStyle = computed(() => ({
  height: `${VIEWBOX_HEIGHT * zoom.value}px`,
  width: `${VIEWBOX_WIDTH * zoom.value}px`,
}));

const stopRadius = computed(() => Math.max(3.4, 7 / zoom.value));
const stopHaloRadius = computed(() => Math.max(8, 16 / zoom.value));
const stopStrokeWidth = computed(() => Math.max(1.8, 4 / zoom.value));

const tooltipStyle = computed(() => {
  if (!hoveredStop.value) {
    return {};
  }

  const x = toScreenX(hoveredStop.value.x);
  const y = toScreenY(hoveredStop.value.y);
  const horizontalOffset = hoveredStop.value.x > 0.68 ? -278 : 22;
  const verticalOffset = hoveredStop.value.y > 0.72 ? -146 : -30;

  return {
    left: `${x + horizontalOffset}px`,
    top: `${y + verticalOffset}px`,
  };
});

const visibleLabelIds = computed(() => {
  const map = lineMap.value;

  if (!map) {
    return new Set<string>();
  }

  if (zoom.value >= 2.15) {
    return new Set(map.stops.map((stop) => stop.id));
  }

  const requiredIds = new Set<string>(
    [
      ...getTerminalStopIds(map),
      props.selectedStationId ?? "",
      hoveredStop.value?.id ?? "",
    ].filter(Boolean),
  );
  const placedLabels: Array<{ x: number; y: number }> = [];
  const labelIds = new Set<string>();
  const minimumDistance =
    zoom.value >= 1.55 ? 62 : zoom.value >= 1.25 ? 78 : 96;
  const sortedStops = [...map.stops].sort(
    (left, right) =>
      getLabelPriority(right, requiredIds) -
      getLabelPriority(left, requiredIds),
  );

  sortedStops.forEach((stop) => {
    const x = toScreenX(stop.x);
    const y = toScreenY(stop.y);
    const required = requiredIds.has(stop.id);
    const collides = placedLabels.some(
      (label) => Math.hypot(label.x - x, label.y - y) < minimumDistance,
    );

    if (!required && collides) {
      return;
    }

    labelIds.add(stop.id);
    placedLabels.push({ x, y });
  });

  return labelIds;
});

watch(
  () => props.line?.id,
  () => {
    if (props.line) {
      void loadMap();
      return;
    }

    lineMap.value = undefined;
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (clearHoverTimer) {
    window.clearTimeout(clearHoverTimer);
  }

  if (clearTransferTimer) {
    window.clearTimeout(clearTransferTimer);
  }
});

async function loadMap(): Promise<void> {
  if (!props.line) {
    return;
  }

  const requestId = ++latestMapRequest;
  loadingMap.value = true;
  errorMessage.value = "";
  hoveredStop.value = undefined;

  try {
    const map = await loadDetailedLineMap(props.line);

    if (requestId === latestMapRequest) {
      lineMap.value = map;
      zoom.value = getDefaultZoom(map);
    }
  } catch (error) {
    if (requestId === latestMapRequest) {
      lineMap.value = undefined;
      errorMessage.value =
        error instanceof Error ? error.message : "Plan indisponible";
    }
  } finally {
    if (requestId === latestMapRequest) {
      loadingMap.value = false;
    }
  }
}

function selectStop(stop: LineMapStopView): void {
  showStop(stop);

  if (canSelectStops.value) {
    emit("select", stop.station);
  }
}

function showStop(stop: LineMapStopView): void {
  if (clearHoverTimer) {
    window.clearTimeout(clearHoverTimer);
    clearHoverTimer = undefined;
  }

  hoveredStop.value = stop;
  activeTransfer.value = undefined;
  void loadTransfers(stop);
}

function scheduleHideStop(): void {
  if (clearHoverTimer) {
    window.clearTimeout(clearHoverTimer);
  }

  clearHoverTimer = window.setTimeout(() => {
    hoveredStop.value = undefined;
    activeTransfer.value = undefined;
  }, 140);
}

async function loadTransfers(stop: LineMapStopView): Promise<void> {
  if (transferStates[stop.id]) {
    return;
  }

  transferStates[stop.id] = {
    loading: true,
    lines: [],
  };

  try {
    const lines = await loadStationTransfers(stop.station, props.line?.id);

    transferStates[stop.id] = {
      loading: false,
      lines,
    };
  } catch {
    transferStates[stop.id] = {
      loading: false,
      lines: [],
      error: "Correspondances indisponibles",
    };
  }
}

function showTransfer(transfer: TransferLineOption): void {
  if (clearTransferTimer) {
    window.clearTimeout(clearTransferTimer);
    clearTransferTimer = undefined;
  }

  activeTransfer.value = transfer;

  if (isBusTransfer(transfer)) {
    void loadBusDirections(transfer);
  }
}

function scheduleHideTransfer(): void {
  if (clearTransferTimer) {
    window.clearTimeout(clearTransferTimer);
  }

  clearTransferTimer = window.setTimeout(() => {
    activeTransfer.value = undefined;
  }, 140);
}

async function loadBusDirections(transfer: TransferLineOption): Promise<void> {
  if (directionStates[transfer.id]) {
    return;
  }

  directionStates[transfer.id] = {
    loading: true,
    directions: [],
  };

  try {
    const result: TransferLineDirections = await loadTransferLineDirections(
      transfer.id,
    );

    directionStates[transfer.id] = {
      loading: false,
      directions: result.directions,
    };
  } catch {
    directionStates[transfer.id] = {
      loading: false,
      directions: [],
      error: "Directions indisponibles",
    };
  }
}

function getSegmentStop(
  segment: LineMapSegmentView,
  side: "from" | "to",
): LineMapStopView | undefined {
  return stopById.value.get(
    side === "from" ? segment.fromStopId : segment.toStopId,
  );
}

function getSegmentX(segment: LineMapSegmentView, side: "from" | "to"): number {
  return toSvgX(getSegmentStop(segment, side)?.x ?? 0);
}

function getSegmentY(segment: LineMapSegmentView, side: "from" | "to"): number {
  return toSvgY(getSegmentStop(segment, side)?.y ?? 0);
}

function toSvgX(value: number): number {
  return SVG_PADDING_X + value * (VIEWBOX_WIDTH - SVG_PADDING_X * 2);
}

function toSvgY(value: number): number {
  return SVG_PADDING_Y + value * (VIEWBOX_HEIGHT - SVG_PADDING_Y * 2);
}

function toScreenX(value: number): number {
  return toSvgX(value) * zoom.value;
}

function toScreenY(value: number): number {
  return toSvgY(value) * zoom.value;
}

function shouldShowLabel(stop: LineMapStopView): boolean {
  return visibleLabelIds.value.has(stop.id);
}

function getLabelAnchor(stop: LineMapStopView): "middle" | "start" | "end" {
  const offset = getLabelOffset(stop);

  if (offset.x < 0) {
    return "end";
  }

  if (Math.abs(offset.x) < 4) {
    return "middle";
  }

  return "start";
}

function getLabelX(stop: LineMapStopView, index: number): number {
  return toSvgX(stop.x) + getLabelOffset(stop, index).x / zoom.value;
}

function getLabelY(stop: LineMapStopView, index: number): number {
  return toSvgY(stop.y) + getLabelOffset(stop, index).y / zoom.value;
}

function getLabelOffset(
  stop: LineMapStopView,
  index = lineMap.value?.stops.findIndex((item) => item.id === stop.id) ?? 0,
): { x: number; y: number } {
  if (
    props.selectedStationId === stop.id ||
    hoveredStop.value?.id === stop.id
  ) {
    return { x: 18, y: -18 };
  }

  const offsets = [
    { x: 18, y: -16 },
    { x: -18, y: 18 },
    { x: 18, y: 22 },
    { x: -18, y: -16 },
    { x: 0, y: -24 },
    { x: 0, y: 30 },
  ];

  return offsets[index % offsets.length];
}

function getLineStyle() {
  const color = lineMap.value?.lineColor ?? props.line?.color ?? "#0064ff";

  return {
    stroke: color,
  };
}

function getStopStyle(stop: LineMapStopView) {
  const color = lineMap.value?.lineColor ?? props.line?.color ?? "#0064ff";
  const isSelected = stop.id === props.selectedStationId;

  return {
    fill: isSelected ? color : "#ffffff",
    stroke: color,
    strokeWidth: `${stopStrokeWidth.value}px`,
  };
}

function getLabelStyle() {
  return {
    fontSize: `${12.5 / zoom.value}px`,
    strokeWidth: `${5 / zoom.value}px`,
  };
}

function getHitTargetStyle(stop: LineMapStopView) {
  return {
    height: `${34}px`,
    left: `${toScreenX(stop.x)}px`,
    top: `${toScreenY(stop.y)}px`,
    width: `${34}px`,
  };
}

function getStopActionLabel(stop: LineMapStopView): string {
  return canSelectStops.value
    ? `Sélectionner ${stop.label}`
    : `Afficher ${stop.label}`;
}

function getTransferStyle(line: TransferLineOption) {
  return {
    background: line.color ?? "#eef3fb",
    color: line.textColor ?? "#10233f",
  };
}

function adjustZoom(delta: number): void {
  zoom.value = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Number((zoom.value + delta).toFixed(2))),
  );
}

function resetZoom(): void {
  if (!lineMap.value) {
    zoom.value = 1.12;
    return;
  }

  zoom.value = getDefaultZoom(lineMap.value);
}

function getDefaultZoom(map: LineMapViewModel): number {
  if (isExplorerMode.value) {
    return map.stops.length > 55 ? 1.02 : 1;
  }

  return map.stops.length > 45 ? 1.22 : 1.12;
}

function getTerminalStopIds(map: LineMapViewModel): string[] {
  const degrees = new Map<string, number>();

  map.segments.forEach((segment) => {
    degrees.set(segment.fromStopId, (degrees.get(segment.fromStopId) ?? 0) + 1);
    degrees.set(segment.toStopId, (degrees.get(segment.toStopId) ?? 0) + 1);
  });

  return map.stops
    .filter((stop) => (degrees.get(stop.id) ?? 0) <= 1)
    .map((stop) => stop.id);
}

function getLabelPriority(
  stop: LineMapStopView,
  requiredIds: Set<string>,
): number {
  if (requiredIds.has(stop.id)) {
    return 100;
  }

  return stop.routeIds.length;
}
</script>

<template>
  <div
    class="line-map-panel"
    :class="{ 'line-map-panel--explorer': isExplorerMode }"
  >
    <div class="line-map-panel__bar">
      <span
        class="line-map-chip"
        :style="{
          background: props.line?.color ?? '#0064ff',
          color: props.line?.textColor ?? '#ffffff',
        }"
      >
        {{ props.line?.label }}
      </span>
      <span v-if="selectedStop" class="line-map-selected-pill">
        {{ selectedStop.label }}
      </span>
      <span v-if="lineMap" class="line-map-stats">{{ mapStats }}</span>
      <div v-if="lineMap" class="line-map-zoom" aria-label="Zoom du plan">
        <button
          class="icon-button line-map-zoom__button"
          type="button"
          aria-label="Dézoomer"
          @click="adjustZoom(-ZOOM_STEP)"
        >
          −
        </button>
        <button
          class="button-secondary line-map-zoom__reset"
          type="button"
          @click="resetZoom"
        >
          {{ Math.round(zoom * 100) }}%
        </button>
        <button
          class="icon-button line-map-zoom__button"
          type="button"
          aria-label="Zoomer"
          @click="adjustZoom(ZOOM_STEP)"
        >
          +
        </button>
      </div>
      <span v-if="loadingMap" class="field-loader">
        <span aria-hidden="true" class="loader-dot"></span>
        Chargement du plan
      </span>
    </div>

    <div v-if="loadingMap" class="line-map-state">
      <span aria-hidden="true" class="loader-dot line-map-state__loader"></span>
      <strong>Plan en cours de chargement</strong>
    </div>

    <div v-else-if="errorMessage" class="line-map-state line-map-state--error">
      <strong>{{ errorMessage }}</strong>
      <button class="button-secondary" type="button" @click="loadMap">
        Réessayer
      </button>
    </div>

    <div
      v-else-if="lineMap"
      class="line-map-canvas"
      @mouseleave="scheduleHideStop"
    >
      <svg
        class="line-map-svg"
        role="img"
        :style="svgStyle"
        :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
        data-testid="line-map"
      >
        <g class="line-map-tiles" aria-hidden="true">
          <image
            v-for="tile in lineMap.tiles"
            :key="tile.id"
            class="line-map-tile"
            :href="tile.url"
            :x="tile.x"
            :y="tile.y"
            :width="tile.width"
            :height="tile.height"
            preserveAspectRatio="none"
          />
        </g>

        <g class="line-map-map-mask" aria-hidden="true">
          <rect x="0" y="0" :width="VIEWBOX_WIDTH" :height="VIEWBOX_HEIGHT" />
        </g>

        <g class="line-map-segments">
          <line
            v-for="segment in lineMap.segments"
            :key="segment.id"
            class="line-map-segment"
            :x1="getSegmentX(segment, 'from')"
            :y1="getSegmentY(segment, 'from')"
            :x2="getSegmentX(segment, 'to')"
            :y2="getSegmentY(segment, 'to')"
            :style="getLineStyle()"
          />
        </g>

        <g
          v-for="(stop, index) in lineMap.stops"
          :key="stop.id"
          class="line-map-stop"
          :class="{
            'line-map-stop--selected': stop.id === selectedStationId,
            'line-map-stop--hovered': stop.id === hoveredStop?.id,
          }"
        >
          <circle
            class="line-map-stop__halo"
            :cx="toSvgX(stop.x)"
            :cy="toSvgY(stop.y)"
            :r="stopHaloRadius"
          />
          <circle
            class="line-map-stop__dot"
            :cx="toSvgX(stop.x)"
            :cy="toSvgY(stop.y)"
            :r="stopRadius"
            :style="getStopStyle(stop)"
          />
          <text
            v-if="shouldShowLabel(stop)"
            class="line-map-stop__label"
            :x="getLabelX(stop, index)"
            :y="getLabelY(stop, index)"
            :style="getLabelStyle()"
            :text-anchor="getLabelAnchor(stop)"
          >
            {{ stop.label }}
          </text>
        </g>
      </svg>

      <button
        v-for="stop in lineMap.stops"
        :key="`${stop.id}:hit-target`"
        class="line-map-hit-target"
        type="button"
        :aria-label="getStopActionLabel(stop)"
        :style="getHitTargetStyle(stop)"
        @click="selectStop(stop)"
        @focus="showStop(stop)"
        @mouseenter="showStop(stop)"
        @mouseleave="scheduleHideStop"
      ></button>

      <div
        v-if="hoveredStop"
        class="line-map-tooltip"
        :style="tooltipStyle"
        @mouseenter="showStop(hoveredStop)"
        @mouseleave="scheduleHideStop"
      >
        <strong>{{ hoveredStop.label }}</strong>
        <span v-if="hoveredStop.city">{{ hoveredStop.city }}</span>
        <div class="line-map-tooltip__transfers">
          <small>Correspondances</small>
          <span v-if="hoveredTransferState?.loading" class="field-loader">
            <span aria-hidden="true" class="loader-dot"></span>
            Chargement
          </span>
          <span
            v-else-if="hoveredTransferState?.error"
            class="line-map-tooltip__muted"
          >
            Indisponible
          </span>
          <span
            v-else-if="
              hoveredTransferState && hoveredTransferState.lines.length === 0
            "
            class="line-map-tooltip__muted"
          >
            Aucune autre ligne
          </span>
          <span v-else class="transfer-badges">
            <button
              v-for="transfer in hoveredTransferState?.lines.slice(0, 12)"
              :key="transfer.id"
              class="transfer-badge"
              type="button"
              :class="{
                'transfer-badge--active': transfer.id === activeTransfer?.id,
              }"
              :style="getTransferStyle(transfer)"
              :title="transfer.mode"
              @click="showTransfer(transfer)"
              @focus="showTransfer(transfer)"
              @blur="scheduleHideTransfer"
              @mouseenter="showTransfer(transfer)"
              @mouseleave="scheduleHideTransfer"
            >
              {{ transfer.label }}
            </button>
          </span>
        </div>

        <div
          v-if="activeTransfer && isBusTransfer(activeTransfer)"
          class="transfer-directions"
          @mouseenter="showTransfer(activeTransfer)"
          @mouseleave="scheduleHideTransfer"
        >
          <small>Directions {{ activeTransfer.label }}</small>
          <span v-if="activeDirectionState?.loading" class="field-loader">
            <span aria-hidden="true" class="loader-dot"></span>
            Chargement
          </span>
          <span
            v-else-if="activeDirectionState?.error"
            class="line-map-tooltip__muted"
          >
            Indisponible
          </span>
          <span
            v-else-if="activeDirectionState?.directions.length"
            class="transfer-directions__list"
          >
            {{ activeDirectionState.directions.join(" · ") }}
          </span>
          <span v-else class="line-map-tooltip__muted"> Aucune direction </span>
        </div>
      </div>
    </div>
  </div>
</template>

