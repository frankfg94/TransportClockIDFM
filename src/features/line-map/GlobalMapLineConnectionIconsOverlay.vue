<script setup lang="ts">
import { computed } from "vue";
import LineIconBadge from "../../components/LineIconBadge.vue";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import { worldToScreen } from "../transport-map/geo/coordinateKernel";
import { createTransportLineSearchOption } from "../transport-map/overlays/ghostLineDirections";
import type { GlobalLineConnectionStation } from "./globalLineMetadata";

interface ConnectionIconGroup extends GlobalLineConnectionStation {
  lines: GlobalMapLine[];
}

const props = defineProps<{
  enabled: boolean;
  groups: readonly ConnectionIconGroup[];
  camera: CameraState;
}>();

const iconGroups = computed(() => {
  if (!props.enabled) return [];

  return props.groups.flatMap((group) => {
    const lines = group.lines
      .map((line) => ({ line, presentation: createTransportLineSearchOption(line) }))
      .filter((entry): entry is { line: GlobalMapLine; presentation: NonNullable<ReturnType<typeof createTransportLineSearchOption>> } => Boolean(entry.presentation));
    if (lines.length === 0) return [];

    return [{
      id: group.station.id,
      stationName: group.station.name,
      screenPoint: worldToScreen(
        { x: group.station.worldX, y: group.station.worldY },
        props.camera,
      ),
      lines,
    }];
  });
});
</script>

<template>
  <div
    v-if="iconGroups.length"
    class="global-map-line-connection-icons-overlay"
    data-testid="global-map-line-connection-icons"
    aria-hidden="true"
  >
    <span
      v-for="group in iconGroups"
      :key="group.id"
      class="global-map-line-connection-icons__group"
      :data-station-id="group.id"
      :data-station-name="group.stationName"
      :style="{ left: `${group.screenPoint.x}px`, top: `${group.screenPoint.y}px` }"
    >
      <span class="global-map-line-connection-icons__badges">
        <LineIconBadge
          v-for="entry in group.lines"
          :key="entry.line.id"
          :line="entry.presentation"
          compact
          eager
        />
      </span>
      <span class="global-map-line-connection-icons__station-pin" />
    </span>
  </div>
</template>

<style scoped>
.global-map-line-connection-icons-overlay {
  position: absolute;
  z-index: 5;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.global-map-line-connection-icons__group {
  position: absolute;
  display: inline-flex;
  align-items: center;
  transform: translate(-50%, -100%);
}

.global-map-line-connection-icons__badges {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  max-width: 168px;
  gap: 2px;
  padding: 3px 5px;
  border: 1px solid rgba(24, 35, 63, .16);
  border-radius: 8px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 4px 12px rgba(15, 23, 42, .22);
}

.global-map-line-connection-icons__badges::after {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 7px;
  height: 7px;
  content: "";
  border-right: 1px solid rgba(24, 35, 63, .16);
  border-bottom: 1px solid rgba(24, 35, 63, .16);
  background: #fff;
  transform: translate(-50%, 50%) rotate(45deg);
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge) {
  height: 25px;
  min-width: 29px;
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge img) {
  max-height: 25px;
  max-width: 44px;
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge__fallback) {
  height: 24px;
}

.global-map-line-connection-icons__badges :deep(.line-icon-badge__label) {
  min-width: 26px;
  padding: 0 4px;
  font-size: .72rem;
}

.global-map-line-connection-icons__station-pin {
  position: absolute;
  bottom: -7px;
  left: 50%;
  width: 5px;
  height: 5px;
  border: 1px solid #fff;
  border-radius: 50%;
  background: #18233f;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .28);
  transform: translateX(-50%);
}
</style>
