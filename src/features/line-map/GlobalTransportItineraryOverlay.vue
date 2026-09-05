<script setup lang="ts">
import { computed } from "vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import {
  createLinePresentation,
  transitModeToFamily,
} from "../../services/linePresentation";
import type { CameraState } from "../transport-map/geo/camera";
import {
  lonLatToWorld,
  worldScaleAtZoom,
  worldToScreen,
  type WorldPoint,
} from "../transport-map/geo/coordinateKernel";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import {
  isNearbyJourneyWalkingSection,
  type NearbyJourneySection,
  type RouteExit,
} from "../nearby-stations/nearbyHeavyTransports";
import type {
  GlobalTransportItineraryRoute,
  GlobalTransportItinerarySegment,
} from "./globalTransportItineraryGeometry";
import { createGlobalTransportItinerarySegments } from "./globalTransportItineraryGeometry";

type ScreenPoint = { x: number; y: number };

type ItineraryLineBadge = {
  id?: string;
  ref?: string;
  label: string;
  shortName: string;
  family?: ReturnType<typeof transitModeToFamily>;
  mode?: string;
  color?: string;
  textColor?: string;
  iconUrl?: string;
  iconUrls?: string[];
};

type PreparedItineraryPath = ReturnType<typeof createGlobalTransportItinerarySegments>[number] & {
  d: string;
  fromWorld: WorldPoint;
  toWorld: WorldPoint;
  iconWorldPoint?: WorldPoint;
  iconOffset?: ScreenPoint;
  line?: ItineraryLineBadge;
};

type ResolvedRouteExit = {
  key: string;
  id: string;
  stationWorld: WorldPoint;
  pointWorld: WorldPoint;
  label: string;
};

const props = defineProps<{
  route?: GlobalTransportItineraryRoute;
  origin?: GeocoderPoint;
  destination?: GeocoderPoint;
  segments?: readonly GlobalTransportItinerarySegment[];
  camera: CameraState;
  getSectionExits?: (section: NearbyJourneySection) => readonly RouteExit[];
}>();

// Route normalization (including walking geometry alignment) is independent
// from the camera. Cache it so a pan/zoom only has to project the already
// prepared coordinates instead of rebuilding the itinerary on every frame.
const itinerarySegments = computed(() => props.segments ?? createGlobalTransportItinerarySegments(
  props.route,
  props.origin,
  props.destination,
));

const itineraryLineBadges = computed(() => new Map(
  itinerarySegments.value
    .filter((segment) => segment.kind === "transit")
    .map((segment) => [segment.id, createItineraryLineBadge(segment)] as const),
));

// Keep the expensive part of the overlay camera-independent. A pan or zoom
// can then update one SVG matrix instead of rebuilding every route path.
const paths = computed<PreparedItineraryPath[]>(() => {
  const lineBadges = itineraryLineBadges.value;

  return itinerarySegments.value.flatMap((segment) => {
    const worldPoints = segment.coordinates.map(lonLatToWorld);
    if (worldPoints.length < 2 || worldPoints.some((point) => !isFiniteWorldPoint(point))) {
      return [];
    }

    const iconPlacement = segment.kind === "transit"
      ? findPathIconPlacement(worldPoints)
      : undefined;
    return [{
      ...segment,
      d: createWorldPathData(worldPoints),
      fromWorld: worldPoints[0]!,
      toWorld: worldPoints.at(-1)!,
      ...(iconPlacement
        ? {
            iconWorldPoint: iconPlacement.worldPoint,
            iconOffset: iconPlacement.offset,
            line: lineBadges.get(segment.id),
          }
        : {}),
    }];
  });
});

const lineIconPaths = computed(() => paths.value.flatMap((path) => {
  if (!path.iconWorldPoint || !path.line) return [];
  const iconPoint = worldToScreen(path.iconWorldPoint, props.camera);
  if (!isFiniteScreenPoint(iconPoint)) return [];
  return [{ ...path, iconPoint }];
}));

const itineraryTransform = computed(() => {
  const { centerWorldX, centerWorldY, zoom, viewportWidthCssPx, viewportHeightCssPx } = props.camera;
  const scale = worldScaleAtZoom(zoom);
  return `matrix(${scale} 0 0 ${scale} ${viewportWidthCssPx / 2 - centerWorldX * scale} ${viewportHeightCssPx / 2 - centerWorldY * scale})`;
});

const endpointWorldNodes = computed(() => {
  const route = props.route;
  if (!route || !props.origin || !props.destination) return [];
  return [
    { id: "origin", point: props.origin, className: "global-transport-itinerary-overlay__node--origin" },
    { id: "destination", point: props.destination, className: "global-transport-itinerary-overlay__node--destination" },
  ].map((node) => ({
    ...node,
    world: lonLatToWorld(node.point),
  }));
});

const endpointNodes = computed(() => endpointWorldNodes.value.flatMap((node) => {
  const point = worldToScreen(node.world, props.camera);
  return isFiniteScreenPoint(point) ? [{ ...node, ...point }] : [];
}));

// Resolve exits only when the route or exit provider changes. Camera changes
// merely project these already-resolved world points below.
const resolvedRouteExits = computed<ResolvedRouteExit[]>(() => {
  const route = props.route;
  const getSectionExits = props.getSectionExits;
  if (!route || !getSectionExits) return [];

  return route.sections.flatMap((section, sectionIndex) => {
    if (
      isNearbyJourneyWalkingSection(section)
      || !hasTransitIdentity(section)
      || !section.toPoint
    ) {
      return [];
    }

    const renderedTransitPath = paths.value.find((path) =>
      path.id === `${route.id}:transit:${sectionIndex}`,
    );
    // Connect every exit to the endpoint actually rendered for the transit
    // segment. The provider boundary can differ slightly from the selected
    // map vertex, which otherwise leaves the orange connectors floating.
    const stationWorld = renderedTransitPath?.toWorld ?? lonLatToWorld(section.toPoint);
    if (!isFiniteWorldPoint(stationWorld)) return [];

    return getSectionExits(section).flatMap((exit) => {
      if (
        !Number.isFinite(exit.lon)
        || !Number.isFinite(exit.lat)
        || !exit.name.trim()
      ) {
        return [];
      }

      const pointWorld = lonLatToWorld(exit);
      if (!isFiniteWorldPoint(pointWorld)) return [];

      return [{
        key: [sectionIndex, exit.id].join(":"),
        id: exit.id,
        stationWorld,
        pointWorld,
        label: [exit.code?.trim(), exit.name.trim()].filter(Boolean).join(" · "),
      }];
    });
  });
});

const routeExitNodes = computed(() => resolvedRouteExits.value.flatMap((exit) => {
  const station = worldToScreen(exit.stationWorld, props.camera);
  const point = worldToScreen(exit.pointWorld, props.camera);
  return isFiniteScreenPoint(station) && isFiniteScreenPoint(point)
    ? [{ ...exit, station, point }]
    : [];
}));

function hasTransitIdentity(section: NearbyJourneySection): boolean {
  return Boolean(section.lineId || section.lineCode || section.lineMode);
}

function createItineraryLineBadge(
  segment: ReturnType<typeof createGlobalTransportItinerarySegments>[number],
): ItineraryLineBadge {
  const family = transitModeToFamily(segment.lineMode);
  const label = segment.lineCode?.trim() || "?";
  const identity = segment.lineId ?? segment.lineCode;
  return {
    ...createLinePresentation({
      id: identity,
      ref: identity,
      code: label,
      shortName: label,
      family,
      mode: segment.lineMode,
      color: segment.color,
      textColor: segment.textColor,
    }),
    id: identity,
    ref: identity,
    label,
    shortName: label,
    family,
    mode: segment.lineMode,
  };
}

function createWorldPathData(points: readonly WorldPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(12)} ${point.y.toFixed(12)}`)
    .join(" ");
}

function findPathIconPlacement(points: readonly WorldPoint[]): {
  worldPoint: WorldPoint;
  offset: ScreenPoint;
} | undefined {
  if (points.length < 2) return undefined;

  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalLength += distanceBetween(points[index - 1]!, points[index]!);
  }
  if (!(totalLength > 0)) {
    return {
      worldPoint: points[Math.floor(points.length / 2)]!,
      offset: { x: 0, y: 0 },
    };
  }

  const targetLength = totalLength / 2;
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const segmentLength = distanceBetween(from, to);
    if (traversed + segmentLength < targetLength) {
      traversed += segmentLength;
      continue;
    }

    const ratio = segmentLength > 0
      ? (targetLength - traversed) / segmentLength
      : 0;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return { worldPoint: { x, y }, offset: { x: 0, y: 0 } };

    // Lift the badge a little off the stroke so the official pictogram stays
    // legible without hiding the route it labels.
    const offset = 18;
    return {
      worldPoint: { x, y },
      offset: {
        x: -(dy / length) * offset,
        y: (dx / length) * offset,
      },
    };
  }

  const worldPoint = points.at(-1);
  return worldPoint ? { worldPoint, offset: { x: 0, y: 0 } } : undefined;
}

function distanceBetween(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function isFiniteWorldPoint(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteScreenPoint(point: ScreenPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
</script>

<template>
  <div
    v-if="paths.length > 0 || routeExitNodes.length > 0"
    class="global-transport-itinerary-overlay"
    aria-hidden="true"
  >
    <svg
      data-testid="global-transport-itinerary-overlay"
      :viewBox="`0 0 ${camera.viewportWidthCssPx} ${camera.viewportHeightCssPx}`"
      preserveAspectRatio="none"
    >
      <g :transform="itineraryTransform">
        <g v-for="path in paths" :key="path.id" :class="`global-transport-itinerary-overlay__segment--${path.kind}`">
          <path class="global-transport-itinerary-overlay__underlay" :d="path.d" />
          <path
            class="global-transport-itinerary-overlay__path"
            :class="{ 'global-transport-itinerary-overlay__path--walking': path.kind === 'walking' }"
            :d="path.d"
            :style="path.kind === 'transit' ? { stroke: path.color ?? '#5146ff' } : undefined"
          />
        </g>
      </g>
      <circle
        v-for="node in endpointNodes"
        :key="node.id"
        class="global-transport-itinerary-overlay__node"
        :class="node.className"
        :cx="node.x"
        :cy="node.y"
        r="7"
      />
      <g
        v-for="exit in routeExitNodes"
        :key="exit.key"
        class="global-transport-itinerary-overlay__exit"
        data-testid="global-transport-itinerary-exit"
        :data-exit-id="exit.id"
      >
        <line
          class="global-transport-itinerary-overlay__exit-connector"
          :x1="exit.station.x"
          :y1="exit.station.y"
          :x2="exit.point.x"
          :y2="exit.point.y"
        />
        <circle
          class="global-transport-itinerary-overlay__exit-marker"
          :cx="exit.point.x"
          :cy="exit.point.y"
          r="5"
        />
        <text
          class="global-transport-itinerary-overlay__exit-label"
          :x="exit.point.x + 9"
          :y="exit.point.y - 8"
        >{{ exit.label }}</text>
      </g>
    </svg>
    <div class="global-transport-itinerary-overlay__line-icons">
      <span
        v-for="path in lineIconPaths"
        :key="`${path.id}:icon`"
        class="global-transport-itinerary-overlay__line-icon"
        data-testid="global-transport-itinerary-line-icon"
        :data-line-code="path.line?.label"
        :style="{
          left: `${path.iconPoint?.x ?? 0}px`,
          top: `${path.iconPoint?.y ?? 0}px`,
          transform: `translate(-50%, -50%) translate(${path.iconOffset?.x ?? 0}px, ${path.iconOffset?.y ?? 0}px)`,
        }"
      >
        <LineIconBadge :line="path.line!" compact eager />
      </span>
    </div>
  </div>
</template>

<style scoped>
.global-transport-itinerary-overlay { inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; height: 100%; z-index: 3; }
.global-transport-itinerary-overlay > svg { inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; height: 100%; }
.global-transport-itinerary-overlay__line-icons { inset: 0; overflow: visible; pointer-events: none; position: absolute; }
.global-transport-itinerary-overlay__line-icon { align-items: center; display: inline-flex; position: absolute; transform: translate(-50%, -50%); padding: 2px 3px; border: 1px solid rgba(81, 70, 255, .18); border-radius: 9px; background: rgba(255, 255, 255, .96); box-shadow: 0 4px 12px rgba(15, 23, 42, .2); }
.global-transport-itinerary-overlay__line-icon :deep(.line-icon-badge) { height: 27px; min-width: 38px; }
.global-transport-itinerary-overlay__line-icon :deep(.line-icon-badge img) { max-height: 27px; max-width: 52px; }
.global-transport-itinerary-overlay__line-icon :deep(.line-icon-badge__fallback) { height: 27px; }
.global-transport-itinerary-overlay__line-icon :deep(.line-icon-badge__label) { font-size: .9rem; min-width: 34px; }
.global-transport-itinerary-overlay__underlay { fill: none; stroke: rgba(255,255,255,.9); stroke-linecap: round; stroke-linejoin: round; stroke-width: 10; vector-effect: non-scaling-stroke; }
.global-transport-itinerary-overlay__path { fill: none; stroke: #5146ff; stroke-linecap: round; stroke-linejoin: round; stroke-width: 6; vector-effect: non-scaling-stroke; }
.global-transport-itinerary-overlay__path--walking { stroke: #5146ff; stroke-dasharray: 2 8; stroke-width: 4; }
.global-transport-itinerary-overlay__segment--walking .global-transport-itinerary-overlay__underlay { stroke-dasharray: 2 8; stroke-width: 8; }
.global-transport-itinerary-overlay__node { fill: #fff; stroke: #5146ff; stroke-width: 3; }
.global-transport-itinerary-overlay__node--origin { fill: #d92d20; stroke: #fff; }
.global-transport-itinerary-overlay__node--destination { fill: #17864c; stroke: #fff; }
.global-transport-itinerary-overlay__exit-connector { fill: none; stroke: #f97316; stroke-dasharray: 3 4; stroke-linecap: round; stroke-width: 1.5; }
.global-transport-itinerary-overlay__exit-marker { fill: #f97316; stroke: #fff; stroke-width: 2; }
.global-transport-itinerary-overlay__exit-label { fill: #9a3412; font-size: 11px; font-weight: 800; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 4px; }
</style>
