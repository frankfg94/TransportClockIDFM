<script setup lang="ts">
import { computed } from "vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import type { GlobalMapLine, GlobalMapPath } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import { worldToScreen } from "../transport-map/geo/coordinateKernel";
import {
  createTransportLineSearchOption,
} from "../transport-map/overlays/ghostLineDirections";

const props = defineProps<{
  enabled: boolean;
  activeLineId?: string;
  lines: readonly GlobalMapLine[];
  paths: readonly GlobalMapPath[];
  camera: CameraState;
}>();

const lineIcons = computed(() => {
  if (!props.enabled) return [];
  const pathsByLine = new Map<string, GlobalMapPath[]>();
  for (const path of props.paths) {
    const paths = pathsByLine.get(path.lineId) ?? [];
    paths.push(path);
    pathsByLine.set(path.lineId, paths);
  }

  return props.lines
    .filter((line) => line.id !== props.activeLineId)
    .flatMap((line) => {
      const path = [...(pathsByLine.get(line.id) ?? [])]
        .sort((left, right) => pathLength(right) - pathLength(left))[0];
      const worldPoint = path ? pathMidpoint(path) : undefined;
      if (!worldPoint) return [];
      const screenPoint = worldToScreen(worldPoint, props.camera);
      const presentation = createTransportLineSearchOption(line);
      if (!presentation) return [];
      return [{
        id: line.id,
        label: presentation.label,
        screenPoint,
        line: presentation,
      }];
    });
});

function pathLength(path: GlobalMapPath): number {
  return path.vertices.reduce((total, vertex, index, vertices) => {
    const previous = vertices[index - 1];
    return previous ? total + Math.hypot(vertex.x - previous.x, vertex.y - previous.y) : total;
  }, 0);
}

function pathMidpoint(path: GlobalMapPath): { x: number; y: number } | undefined {
  if (path.vertices.length === 0) return undefined;
  const total = pathLength(path);
  if (!(total > 0)) return path.vertices[Math.floor(path.vertices.length / 2)];
  let travelled = 0;
  const target = total / 2;
  for (let index = 1; index < path.vertices.length; index += 1) {
    const from = path.vertices[index - 1]!;
    const to = path.vertices[index]!;
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (travelled + segment < target) {
      travelled += segment;
      continue;
    }
    const ratio = segment > 0 ? (target - travelled) / segment : 0;
    return {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    };
  }
  return path.vertices.at(-1);
}
</script>

<template>
  <div
    v-if="lineIcons.length"
    class="global-map-ghost-line-icons-overlay"
    data-testid="global-map-ghost-line-icons"
    aria-hidden="true"
  >
    <span
      v-for="entry in lineIcons"
      :key="entry.id"
      class="global-map-ghost-line-icon"
      :data-line-id="entry.id"
      :data-line-code="entry.label"
      :style="{ left: `${entry.screenPoint.x}px`, top: `${entry.screenPoint.y}px` }"
    >
      <LineIconBadge :line="entry.line" compact eager />
    </span>
  </div>
</template>

<style scoped>
.global-map-ghost-line-icons-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: hidden;
  pointer-events: none;
}
.global-map-ghost-line-icon {
  position: absolute;
  display: inline-flex;
  align-items: center;
  padding: 2px 3px;
  border: 1px solid rgba(81, 70, 255, .2);
  border-radius: 9px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 4px 12px rgba(15, 23, 42, .18);
  transform: translate(-50%, -50%);
}
.global-map-ghost-line-icon :deep(.line-icon-badge) {
  height: 27px;
  min-width: 38px;
}
.global-map-ghost-line-icon :deep(.line-icon-badge img) {
  max-height: 27px;
  max-width: 52px;
}
.global-map-ghost-line-icon :deep(.line-icon-badge__fallback) {
  height: 27px;
}
.global-map-ghost-line-icon :deep(.line-icon-badge__label) {
  font-size: .9rem;
  min-width: 34px;
}
</style>
