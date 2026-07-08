<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";

interface MiniMapNode {
  id: string;
  hidden?: boolean;
  position: {
    x: number;
    y: number;
  };
  data?: {
    current?: boolean;
    served?: boolean;
  };
}

interface MiniMapEdge {
  id: string;
  hidden?: boolean;
  source: string;
  target: string;
  class?: unknown;
}

interface PatternViewport {
  x: number;
  y: number;
  zoom: number;
}

interface PatternViewportSize {
  width: number;
  height: number;
}

interface MiniMapBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface MiniMapPoint {
  x: number;
  y: number;
}

const props = withDefaults(
  defineProps<{
    nodes: MiniMapNode[];
    edges: MiniMapEdge[];
    nodeWidth: number;
    nodeHeight: number;
    viewport: PatternViewport;
    viewportSize: PatternViewportSize;
    lineColor: string;
    width?: number;
    height?: number;
  }>(),
  {
    width: 236,
    height: 126,
  },
);

const emit = defineEmits<{
  focus: [point: MiniMapPoint];
}>();
const { t } = useI18n();

const padding = 12;
const visibleNodes = computed(() => props.nodes.filter((node) => !node.hidden));
const nodeById = computed(
  () => new Map(visibleNodes.value.map((node) => [node.id, node])),
);

// Vue Flow already renders a second animated "light" edge for active segments.
// The minimap only needs the structural rail once, so animated duplicates are
// filtered out and undirected edges are deduped.
const visibleEdges = computed(() => {
  const seen = new Set<string>();

  return props.edges.filter((edge) => {
    if (edge.hidden || edge.id.endsWith(":light")) {
      return false;
    }

    const key = [edge.source, edge.target].sort().join("--");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
});

// The minimap works in SVG coordinates, but the graph is laid out in Vue Flow
// coordinates. These bounds describe the full laid-out graph including node
// dimensions, so the whole rail network can be scaled into the small viewport.
const bounds = computed<MiniMapBounds>(() => {
  if (visibleNodes.value.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: 1,
      height: 1,
    };
  }

  const minX = Math.min(...visibleNodes.value.map((node) => node.position.x));
  const minY = Math.min(...visibleNodes.value.map((node) => node.position.y));
  const maxX = Math.max(
    ...visibleNodes.value.map((node) => node.position.x + props.nodeWidth),
  );
  const maxY = Math.max(
    ...visibleNodes.value.map((node) => node.position.y + props.nodeHeight),
  );

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
});

// Keep the full graph visible while preserving its aspect ratio. This can leave
// unused horizontal or vertical space, which is centered by the offset below.
const scale = computed(() => {
  const availableWidth = Math.max(1, props.width - padding * 2);
  const availableHeight = Math.max(1, props.height - padding * 2);

  return Math.min(
    availableWidth / bounds.value.width,
    availableHeight / bounds.value.height,
  );
});

// Offset recenters the scaled graph inside the minimap and also cancels out
// negative graph coordinates, which can happen after branch layout adjustments.
const offset = computed(() => ({
  x:
    (props.width - bounds.value.width * scale.value) / 2 -
    bounds.value.minX * scale.value,
  y:
    (props.height - bounds.value.height * scale.value) / 2 -
    bounds.value.minY * scale.value,
}));

// Vue Flow stores the camera as a transform applied to the graph. The visible
// rectangle is the inverse of that transform: screen pixels divided by zoom and
// translated back into graph coordinates.
const viewportRect = computed(() => {
  const zoom = Math.max(0.01, props.viewport.zoom);

  if (props.viewportSize.width <= 0 || props.viewportSize.height <= 0) {
    return undefined;
  }

  const flowX = -props.viewport.x / zoom;
  const flowY = -props.viewport.y / zoom;
  const flowWidth = props.viewportSize.width / zoom;
  const flowHeight = props.viewportSize.height / zoom;

  return {
    x: mapX(flowX),
    y: mapY(flowY),
    width: flowWidth * scale.value,
    height: flowHeight * scale.value,
  };
});

// Edges in Vue Flow connect node centers visually in this project, so the
// minimap uses the same center points instead of top-left node positions.
function getNodeCenter(node: MiniMapNode): MiniMapPoint {
  return {
    x: node.position.x + props.nodeWidth / 2,
    y: node.position.y + props.nodeHeight / 2,
  };
}

function mapX(value: number): number {
  return value * scale.value + offset.value.x;
}

function mapY(value: number): number {
  return value * scale.value + offset.value.y;
}

function edgeStroke(edge: MiniMapEdge): string {
  return edgeClassIncludes(edge, "pattern-flow-edge--skipped")
    ? "#b7c2d1"
    : props.lineColor;
}

function edgeOpacity(edge: MiniMapEdge): number {
  return edgeClassIncludes(edge, "pattern-flow-edge--skipped") ? 0.34 : 0.76;
}

// Vue accepts classes as strings, arrays, objects, or functions. The minimap
// only needs to know whether a semantic edge class is present, so it handles the
// static class shapes and safely ignores function classes.
function edgeClassIncludes(edge: MiniMapEdge, className: string): boolean {
  if (typeof edge.class === "string") {
    return edge.class.includes(className);
  }

  if (Array.isArray(edge.class)) {
    return edge.class.includes(className);
  }

  if (edge.class && typeof edge.class === "object") {
    return Boolean((edge.class as Record<string, unknown>)[className]);
  }

  return false;
}

// The minimap intentionally avoids labels. Color, stroke, and radius are enough
// to distinguish current, served, and skipped stations without clutter.
function nodeFill(node: MiniMapNode): string {
  if (node.data?.current) {
    return props.lineColor;
  }

  return node.data?.served === false ? "#eef3fb" : "#ffffff";
}

function nodeStroke(node: MiniMapNode): string {
  return node.data?.served === false ? "#aab6c9" : props.lineColor;
}

function nodeRadius(node: MiniMapNode): number {
  if (node.data?.current) {
    return 4.2;
  }

  return node.data?.served === false ? 2.5 : 3.1;
}

// Clicking the minimap emits a graph-space point. The parent component owns the
// Vue Flow viewport and recenters the main canvas around this point.
function handlePointerDown(event: PointerEvent): void {
  const svg = event.currentTarget;

  if (!(svg instanceof SVGSVGElement)) {
    return;
  }

  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left - offset.value.x) / scale.value;
  const y = (event.clientY - rect.top - offset.value.y) / scale.value;

  emit("focus", { x, y });
}
</script>

<template>
  <div class="pattern-flow-minimap" :aria-label="t('lineMap.minimapAria')">
    <svg
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointerdown.stop.prevent="handlePointerDown"
    >
      <defs>
        <filter
          id="pattern-flow-minimap-shadow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.18" />
        </filter>
      </defs>

      <g class="pattern-flow-minimap__edges">
        <template v-for="edge in visibleEdges" :key="edge.id">
          <line
            v-if="nodeById.has(edge.source) && nodeById.has(edge.target)"
            :x1="mapX(getNodeCenter(nodeById.get(edge.source)!).x)"
            :y1="mapY(getNodeCenter(nodeById.get(edge.source)!).y)"
            :x2="mapX(getNodeCenter(nodeById.get(edge.target)!).x)"
            :y2="mapY(getNodeCenter(nodeById.get(edge.target)!).y)"
            :stroke="edgeStroke(edge)"
            :stroke-opacity="edgeOpacity(edge)"
          />
        </template>
      </g>

      <g class="pattern-flow-minimap__nodes">
        <circle
          v-for="node in visibleNodes"
          :key="node.id"
          :cx="mapX(getNodeCenter(node).x)"
          :cy="mapY(getNodeCenter(node).y)"
          :r="nodeRadius(node)"
          :fill="nodeFill(node)"
          :stroke="nodeStroke(node)"
          :stroke-width="node.data?.current ? 1.8 : 1.3"
        />
      </g>

      <rect
        v-if="viewportRect"
        class="pattern-flow-minimap__viewport"
        :x="viewportRect.x"
        :y="viewportRect.y"
        :width="viewportRect.width"
        :height="viewportRect.height"
        rx="4"
      />
    </svg>
  </div>
</template>

<style scoped>
.pattern-flow-minimap {
  backdrop-filter: blur(12px);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.82),
    rgba(248, 251, 255, 0.7)
  );
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 12px;
  bottom: 14px;
  box-shadow:
    0 16px 42px rgba(16, 35, 63, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  opacity: 0.32;
  padding: 7px;
  position: absolute;
  right: 14px;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    background 160ms ease;
  z-index: 18;
}

.pattern-flow-minimap:hover,
.pattern-flow-minimap:focus-within {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.94),
    rgba(248, 251, 255, 0.86)
  );
  opacity: 0.96;
  transform: translateY(-1px);
}

.pattern-flow-minimap svg {
  cursor: pointer;
  display: block;
  overflow: hidden;
}

.pattern-flow-minimap__edges line {
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3.6;
}

.pattern-flow-minimap__nodes circle {
  filter: url("#pattern-flow-minimap-shadow");
}

.pattern-flow-minimap__viewport {
  fill: rgba(255, 255, 255, 0.18);
  stroke: rgba(5, 7, 12, 0.68);
  stroke-dasharray: 5 4;
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
}

@media (max-width: 720px) {
  .pattern-flow-minimap {
    bottom: 12px;
    opacity: 0.66;
    right: 12px;
    transform: scale(0.82);
    transform-origin: bottom right;
  }

  .pattern-flow-minimap:hover,
  .pattern-flow-minimap:focus-within {
    transform: scale(0.82) translateY(-1px);
  }
}
</style>
