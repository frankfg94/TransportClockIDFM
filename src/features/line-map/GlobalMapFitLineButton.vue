<template>
  <Transition name="global-map-fit-line-fade" :css="!reduceMotion" appear>
    <button
      v-if="outsideViewport && !fitting"
      type="button"
      class="global-map-fit-line"
      :class="{ 'global-map-fit-line--reduced-motion': reduceMotion }"
      data-global-map-fit-line
      :title="t('globalMap.page.fitLine')"
      :aria-label="t('globalMap.page.fitLine')"
      @pointerdown.stop
      @click.stop="emit('fit')"
    >
      <Scan :size="18" aria-hidden="true" />
      <span>{{ t('globalMap.page.fitView') }}</span>
    </button>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Scan } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { GlobalMapBounds } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import { worldScaleAtZoom } from "../transport-map/geo/coordinateKernel";

const props = defineProps<{ bounds: GlobalMapBounds; camera: CameraState; fitting?: boolean; reduceMotion?: boolean }>();
const emit = defineEmits<{ fit: [] }>();
const { t } = useI18n();

// Constant work per camera sample: no geometry traversal, DOM reads or timers.
const outsideViewport = computed(() => {
  const camera = props.camera;
  const scale = worldScaleAtZoom(camera.zoom);
  const halfWidth = camera.viewportWidthCssPx / (2 * scale);
  const halfHeight = camera.viewportHeightCssPx / (2 * scale);
  return props.bounds.minX < camera.centerWorldX - halfWidth
    || props.bounds.maxX > camera.centerWorldX + halfWidth
    || props.bounds.minY < camera.centerWorldY - halfHeight
    || props.bounds.maxY > camera.centerWorldY + halfHeight;
});
</script>

<style scoped>
.global-map-fit-line {
  position: absolute;
  z-index: 8;
  top: calc(env(safe-area-inset-top, 0px) + 76px);
  left: 50%;
  translate: -50% 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-card);
  transition: background var(--motion-fast), scale var(--motion-fast), opacity var(--motion-fast);
}

.global-map-fit-line:hover:not(:disabled),
.global-map-fit-line:focus-visible {
  background: var(--surface-muted-hover);
  color: var(--ink);
  scale: 1.04;
}

.global-map-fit-line:focus-visible {
  outline: 2px solid var(--idfm-blue);
  outline-offset: 3px;
}
.global-map-fit-line-fade-enter-from,
.global-map-fit-line-fade-leave-to {
  opacity: 0;
}

.global-map-fit-line-fade-leave-active {
  pointer-events: none;
}

.global-map-fit-line--reduced-motion {
  transition: none;
  scale: 1 !important;
}

@media (prefers-reduced-motion: reduce) {
  .global-map-fit-line {
    transition: none;
    scale: 1 !important;
  }
}
</style>
