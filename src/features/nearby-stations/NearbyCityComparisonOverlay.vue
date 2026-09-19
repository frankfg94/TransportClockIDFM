<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import { worldScaleAtZoom, lonLatToWorld } from "../transport-map/geo/coordinateKernel";
import type { CameraState } from "../transport-map/geo/camera";
import {
  prepareIrisNeighborhoods,
} from "../transport-map/iris/irisGeometry";
import type { IrisNeighborhood } from "../transport-map/iris/irisApi";
import { mergeNearbyIsochroneGeometries } from "./nearbyIsochroneUnion";

const props = defineProps<{
  neighborhoods: readonly IrisNeighborhood[];
  camera: CameraState;
  currentCommuneCode?: string;
}>();

const emit = defineEmits<{
  select: [communeCode: string];
}>();

interface PreparedCommune {
  code: string;
  name: string;
  departmentCode: string;
  path: string;
  centroidWorld: { x: number; y: number };
}

const { t } = useI18n();

const communes = computed<PreparedCommune[]>(() => {
  const groups = new Map<string, IrisNeighborhood[]>();
  for (const neighborhood of props.neighborhoods) {
    const existing = groups.get(neighborhood.communeCode);
    if (existing) existing.push(neighborhood);
    else groups.set(neighborhood.communeCode, [neighborhood]);
  }
  return [...groups.values()]
    .flatMap((members) => {
      const first = members[0]!;
      // Dissolve the actual polygons, including differently segmented shared
      // edges. One path means one fill, one hover and one keyboard target per
      // commune. This computation depends on source data, never on the camera.
      const geometry = mergeNearbyIsochroneGeometries(members.map(({ geometry }) => ({
        type: "MultiPolygon" as const,
        coordinates: (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates)
          .map((polygon) => polygon.map((ring) => ring.map(([lon, lat]): [number, number] => [lon!, lat!]))),
      })));
      if (!geometry) return [];
      const prepared = prepareIrisNeighborhoods([{
        ...first,
        geometry: {
          type: "MultiPolygon",
          coordinates: (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates)
            .map((polygon) => polygon.map((ring) => ring.map((position) => [...position]))),
        },
      }])[0]!;
      return [{
        code: first.communeCode,
        name: first.communeName,
        departmentCode: first.departmentCode,
        path: prepared.path,
        centroidWorld: lonLatToWorld({
          lon: members.reduce((sum, member) => sum + member.centroid[0], 0) / members.length,
          lat: members.reduce((sum, member) => sum + member.centroid[1], 0) / members.length,
        }),
      }];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr-FR"));
});

const cameraTransform = computed(() => {
  const scale = worldScaleAtZoom(props.camera.zoom);
  return `translate(${props.camera.viewportWidthCssPx / 2 - props.camera.centerWorldX * scale} ${props.camera.viewportHeightCssPx / 2 - props.camera.centerWorldY * scale}) scale(${scale})`;
});
const labelFontSize = computed(() => Math.max(0.000001, Math.min(0.0007, 15 / worldScaleAtZoom(props.camera.zoom))));
const labelStrokeWidth = computed(() => Math.max(0.00000001, 2 / worldScaleAtZoom(props.camera.zoom)));

function selectCommune(communeCode: string): void {
  emit("select", communeCode);
}
</script>

<template>
  <div class="nearby-city-comparison-overlay" data-testid="nearby-city-comparison-overlay" aria-hidden="false">
    <svg
      class="nearby-city-comparison-overlay__svg"
      :style="{ width: `${camera.viewportWidthCssPx}px`, height: `${camera.viewportHeightCssPx}px` }"
      :viewBox="`0 0 ${camera.viewportWidthCssPx} ${camera.viewportHeightCssPx}`"
      preserveAspectRatio="xMinYMin meet"
      role="group"
      :aria-label="t('nearbyStations.cityComparison.neighborsAria')"
    >
      <g :transform="cameraTransform">
        <g
          v-for="commune in communes"
          :key="commune.code"
          class="nearby-city-comparison-overlay__commune"
          :class="{ 'nearby-city-comparison-overlay__commune--current': commune.code === currentCommuneCode }"
        >
          <path
            class="nearby-city-comparison-overlay__shape"
            :d="commune.path"
            :data-city-code="commune.code"
            :data-city-name="commune.name"
            :aria-label="t('nearbyStations.cityComparison.neighborAria', { city: commune.name })"
            role="button"
            tabindex="0"
            @click.stop="selectCommune(commune.code)"
            @keydown.enter.stop.prevent="selectCommune(commune.code)"
            @keydown.space.stop.prevent="selectCommune(commune.code)"
          />
          <text
            class="nearby-city-comparison-overlay__label"
            :x="commune.centroidWorld.x"
            :y="commune.centroidWorld.y"
            :font-size="labelFontSize"
            :stroke-width="labelStrokeWidth"
            text-anchor="middle"
            dominant-baseline="middle"
            aria-hidden="true"
          >{{ commune.name }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.nearby-city-comparison-overlay {
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: absolute;
  /* Keep commune hit areas above IRIS fills, below place and station icons. */
  z-index: 5;
}

.nearby-city-comparison-overlay__svg {
  display: block;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  width: 100%;
}

.nearby-city-comparison-overlay__shape {
  cursor: pointer;
  fill: transparent;
  fill-rule: evenodd;
  /* Transparent fill keeps the whole dissolved commune clickable. */
  pointer-events: fill;
  stroke: #2563eb;
  stroke-dasharray: 4 3;
  stroke-opacity: .8;
  stroke-width: 1.25;
  vector-effect: non-scaling-stroke;
}

.nearby-city-comparison-overlay__label {
  fill: #1e3a8a;
  font-weight: 850;
  paint-order: stroke;
  pointer-events: none;
  stroke: rgba(255, 255, 255, .9);
  stroke-linejoin: round;
  /* Keep the zoom-adjusted stroke-width attribute: a CSS pixel width overrides
     it and is multiplied by the world transform, covering the map in white. */
}

</style>
