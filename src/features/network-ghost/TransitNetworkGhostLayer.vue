<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  NetworkGhostLineView,
  NetworkGhostQuayView,
} from "./types";

const props = withDefaults(
  defineProps<{
    lines: NetworkGhostLineView[];
    quays?: NetworkGhostQuayView[];
    anchorX: number;
    anchorY: number;
    viewBoxWidth?: number;
    viewBoxHeight?: number;
    paddingX?: number;
    paddingY?: number;
    zoom?: number;
    tooltipTarget?: string;
    reduceMotion?: boolean;
    resetKey?: number;
  }>(),
  {
    quays: () => [],
    viewBoxWidth: 1080,
    viewBoxHeight: 620,
    paddingX: 78,
    paddingY: 68,
    zoom: 1,
    tooltipTarget: "",
    reduceMotion: false,
    resetKey: 0,
  },
);

const emit = defineEmits<{
  activeLineChange: [line: NetworkGhostLineView | undefined];
}>();

const hoveredLineId = ref("");
const pinnedLineId = ref("");
const pointerX = ref(0);
const pointerY = ref(0);
const activeLineId = computed(
  () => hoveredLineId.value || pinnedLineId.value,
);
const activeLine = computed(() =>
  props.lines.find((line) => line.id === activeLineId.value),
);
const renderedLines = computed(() => {
  const activeId = activeLineId.value;

  if (!activeId) {
    return props.lines;
  }

  return [
    ...props.lines.filter((line) => line.id !== activeId),
    ...props.lines.filter((line) => line.id === activeId),
  ];
});
const tooltip = computed(() => {
  const line = activeLine.value;

  if (!line) {
    return undefined;
  }

  const zoom = Math.max(props.zoom, 0.01);
  const inverseZoom = 1 / zoom;
  const width = Math.max(148, Math.min(280, line.label.length * 8.4 + 94));
  const height = 50;
  const margin = 8 * inverseZoom;
  const offsetX = 14 * inverseZoom;
  const offsetY = 52 * inverseZoom;
  const sourceX =
    hoveredLineId.value === line.id ? pointerX.value : toSvgX(line.anchorX);
  const sourceY =
    hoveredLineId.value === line.id ? pointerY.value : toSvgY(line.anchorY);

  return {
    line,
    width,
    height,
    inverseZoom,
    x: Math.max(
      margin,
      Math.min(
        props.viewBoxWidth - width * inverseZoom - margin,
        sourceX + offsetX,
      ),
    ),
    y: Math.max(
      margin,
      Math.min(
        props.viewBoxHeight - height * inverseZoom - margin,
        sourceY - offsetY,
      ),
    ),
  };
});

watch(
  () => props.resetKey,
  () => {
    pinnedLineId.value = "";
    hoveredLineId.value = "";
  },
);

watch(
  () => props.lines.map((line) => line.id).join("|"),
  (lineIds) => {
    if (pinnedLineId.value && !lineIds.includes(pinnedLineId.value)) {
      pinnedLineId.value = "";
    }

    if (hoveredLineId.value && !lineIds.includes(hoveredLineId.value)) {
      hoveredLineId.value = "";
    }
  },
);

watch(
  activeLine,
  (line) => {
    emit("activeLineChange", line);
  },
  { immediate: true },
);

function toSvgX(value: number): number {
  return props.paddingX + value * (props.viewBoxWidth - props.paddingX * 2);
}

function toSvgY(value: number): number {
  return props.paddingY + value * (props.viewBoxHeight - props.paddingY * 2);
}

function showLine(line: NetworkGhostLineView, event: PointerEvent): void {
  hoveredLineId.value = line.id;
  updatePointer(event, line);
}

function moveLine(line: NetworkGhostLineView, event: PointerEvent): void {
  if (hoveredLineId.value === line.id) {
    updatePointer(event, line);
  }
}

function hideLine(line: NetworkGhostLineView): void {
  if (hoveredLineId.value === line.id) {
    hoveredLineId.value = "";
  }
}

function togglePinnedLine(line: NetworkGhostLineView): void {
  pinnedLineId.value = pinnedLineId.value === line.id ? "" : line.id;
}

function updatePointer(
  event: PointerEvent,
  line: NetworkGhostLineView,
): void {
  const svg = (event.currentTarget as SVGElement | null)?.ownerSVGElement;
  const rect = svg?.getBoundingClientRect();

  if (!rect?.width || !rect.height) {
    pointerX.value = toSvgX(line.anchorX);
    pointerY.value = toSvgY(line.anchorY);
    return;
  }

  pointerX.value =
    ((event.clientX - rect.left) / rect.width) * props.viewBoxWidth;
  pointerY.value =
    ((event.clientY - rect.top) / rect.height) * props.viewBoxHeight;
}

function getLineVariables(line: NetworkGhostLineView) {
  return {
    "--network-ghost-color": line.color,
    "--network-ghost-opacity": line.isBus ? 0.3 : 0.58,
    "--network-ghost-width": line.isBus ? "4px" : "5px",
  };
}

function getAnimationStyle(line: NetworkGhostLineView, level: number) {
  return {
    animationDelay: `${Math.min(level, 80) * 62 + line.loadOrder * 24}ms`,
  };
}

function getStationRadius(line: NetworkGhostLineView): number {
  return (line.isBus ? 3 : 4) / props.zoom;
}

function getQuayRadius(): number {
  return 3.2 / props.zoom;
}
</script>

<template>
  <g
    class="network-ghost-layer"
    :class="{ 'network-ghost-layer--reduce-motion': reduceMotion }"
    data-testid="network-ghost-layer"
  >
    <g
      v-for="line in renderedLines"
      :key="line.id"
      class="network-ghost-line"
      :class="{
        'network-ghost-line--active': activeLineId === line.id,
        'network-ghost-line--hovered': hoveredLineId === line.id,
        'network-ghost-line--bus': line.isBus,
      }"
      :style="getLineVariables(line)"
      :data-network-ghost-line-id="line.id"
    >
      <line
        v-for="segment in line.segments"
        :key="`${line.id}:${segment.id}:visible`"
        class="network-ghost-line__segment"
        :class="{
          'network-ghost-line__segment--animated': false,
        }"
        :x1="toSvgX(segment.fromX)"
        :y1="toSvgY(segment.fromY)"
        :x2="toSvgX(segment.toX)"
        :y2="toSvgY(segment.toY)"
        stroke-dasharray="none"
        :style="getAnimationStyle(line, segment.level)"
      />

      <line
        v-for="(segment, segmentIndex) in line.segments"
        :key="`${line.id}:${segment.id}:hit`"
        class="network-ghost-line__hit-target"
        :x1="toSvgX(segment.fromX)"
        :y1="toSvgY(segment.fromY)"
        :x2="toSvgX(segment.toX)"
        :y2="toSvgY(segment.toY)"
        :data-network-ghost-line="line.id"
        :role="segmentIndex === 0 ? 'button' : undefined"
        :tabindex="segmentIndex === 0 ? 0 : -1"
        :aria-label="
          segmentIndex === 0 ? `Afficher la ligne ${line.label}` : undefined
        "
        @pointerenter="showLine(line, $event)"
        @pointermove="moveLine(line, $event)"
        @pointerleave="hideLine(line)"
        @focus="hoveredLineId = line.id"
        @blur="hideLine(line)"
        @click.stop="togglePinnedLine(line)"
        @keydown.enter.prevent="togglePinnedLine(line)"
        @keydown.space.prevent="togglePinnedLine(line)"
      />

      <g
        v-if="activeLineId === line.id"
        class="network-ghost-line__stations"
        aria-hidden="true"
      >
        <circle
          v-for="station in line.stations"
          :key="`${line.id}:${station.id}:station`"
          class="network-ghost-line__station"
          :cx="toSvgX(station.x)"
          :cy="toSvgY(station.y)"
          :r="getStationRadius(line)"
        />
      </g>
    </g>

    <g
      v-if="quays.length > 0"
      class="network-ghost-quays"
      data-testid="network-ghost-quays"
    >
      <line
        v-for="quay in quays"
        :key="`${quay.id}:connector`"
        class="network-ghost-quays__connector"
        :x1="toSvgX(anchorX)"
        :y1="toSvgY(anchorY)"
        :x2="toSvgX(quay.x)"
        :y2="toSvgY(quay.y)"
      />
      <circle
        v-for="quay in quays"
        :key="quay.id"
        class="network-ghost-quays__dot"
        :cx="toSvgX(quay.x)"
        :cy="toSvgY(quay.y)"
        :r="getQuayRadius()"
      >
        <title>{{ quay.label }}</title>
      </circle>
    </g>

    <Teleport
      v-if="tooltip"
      :to="tooltipTarget || 'body'"
      :disabled="!tooltipTarget"
    >
      <g
        class="network-ghost-tooltip"
        :transform="`
          translate(${tooltip.x} ${tooltip.y})
          scale(${tooltip.inverseZoom})
        `"
        pointer-events="none"
      >
        <rect
          class="network-ghost-tooltip__surface"
          :width="tooltip.width"
          :height="tooltip.height"
          rx="10"
        />
        <rect
          class="network-ghost-tooltip__icon-fallback"
          x="9"
          y="9"
          width="32"
          height="32"
          rx="7"
          :fill="tooltip.line.color"
        />
        <text
          class="network-ghost-tooltip__icon-label"
          x="25"
          y="30"
          text-anchor="middle"
          :style="{ fill: tooltip.line.textColor }"
        >
          {{ tooltip.line.label }}
        </text>
        <image
          v-if="tooltip.line.iconUrl"
          class="network-ghost-tooltip__icon"
          :href="tooltip.line.iconUrl"
          x="7"
          y="7"
          width="36"
          height="36"
          preserveAspectRatio="xMidYMid meet"
        />
        <text x="50" y="21">{{ tooltip.line.label }}</text>
        <text class="network-ghost-tooltip__mode" x="50" y="37">
          {{ tooltip.line.mode }}
        </text>
      </g>
    </Teleport>
  </g>
</template>

<style scoped>
.network-ghost-line__segment {
  fill: none;
  pointer-events: none;
  stroke: var(--network-ghost-color);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-opacity: var(--network-ghost-opacity);
  stroke-width: var(--network-ghost-width);
  transition:
    stroke-opacity 150ms ease,
    stroke-width 150ms ease;
  vector-effect: non-scaling-stroke;
}

.network-ghost-line__segment--animated {
  animation: network-ghost-reveal 260ms ease-out both;
}

.network-ghost-line--hovered .network-ghost-line__segment--animated {
  animation: none;
  opacity: 1;
}

.network-ghost-line--active .network-ghost-line__segment {
  stroke-opacity: 1;
}

.network-ghost-line--active:not(.network-ghost-line--bus)
  .network-ghost-line__segment {
  stroke-width: 5px;
}

.network-ghost-line__hit-target {
  fill: none;
  outline: none;
  pointer-events: stroke;
  stroke: transparent;
  stroke-linecap: round;
  stroke-width: 16px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-line__station {
  fill: #ffffff;
  pointer-events: none;
  stroke: var(--network-ghost-color);
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-quays__connector {
  pointer-events: none;
  stroke: rgba(15, 23, 42, 0.42);
  stroke-dasharray: 3 3;
  stroke-width: 1.2px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-quays__dot {
  fill: #ffffff;
  pointer-events: auto;
  stroke: #0f172a;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-tooltip__surface {
  fill: rgba(255, 255, 255, 0.98);
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.18));
  stroke: rgba(15, 23, 42, 0.14);
  stroke-width: 1px;
}

.network-ghost-tooltip text {
  fill: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.network-ghost-tooltip__mode {
  fill: #64748b !important;
  font-size: 9px !important;
  font-weight: 750 !important;
  text-transform: uppercase;
}

.network-ghost-tooltip__icon-label {
  font-size: 10px !important;
}

@keyframes network-ghost-reveal {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .network-ghost-line__segment--animated {
    animation: none;
  }
}
</style>
