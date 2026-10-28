<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  active: boolean;
  progress: number | null;
  label: string;
  reduceMotion?: boolean;
}>();
const cursorElement = ref<HTMLDivElement>();
let lastPosition: { x: number; y: number } | undefined;
const percentage = computed(() => props.progress === null ? null : Math.round(Math.max(0, Math.min(1, props.progress)) * 100));
// A completed download can still be followed by filtering and map rendering.
// Keep an open, rotating arc until the whole operation stops being active.
const arcLength = computed(() => percentage.value === null ? 28 : 28 + percentage.value * 0.52);
function positionCursor(): void {
  const element = cursorElement.value;
  if (!element) return;
  element.classList.toggle("global-map-loading-cursor--fixed", !lastPosition);
  element.style.left = lastPosition ? `${Math.max(4, Math.min(lastPosition.x + 10, window.innerWidth - 38))}px` : "";
  element.style.top = lastPosition ? `${Math.max(4, Math.min(lastPosition.y + 10, window.innerHeight - 38))}px` : "";
}

function trackPointer(event: PointerEvent): void {
  lastPosition = event.pointerType === "touch" ? undefined : { x: event.clientX, y: event.clientY };
  // Move the visible DOM immediately, even while Vue has a list render queued.
  positionCursor();
}
function hidePointer(): void {
  lastPosition = undefined;
  positionCursor();
}
watch(cursorElement, positionCursor, { flush: "post" });
watch(() => props.active, (active) => {
  // Do not leave a compositor-animated cursor frozen in place while Vue
  // removes it and renders the newly loaded places in the same update.
  if (cursorElement.value) cursorElement.value.hidden = !active;
}, { flush: "sync" });
onMounted(() => {
  window.addEventListener("pointermove", trackPointer, { passive: true, capture: true });
  window.addEventListener("pointerdown", trackPointer, { passive: true, capture: true });
  window.addEventListener("blur", hidePointer);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", trackPointer, true);
  window.removeEventListener("pointerdown", trackPointer, true);
  window.removeEventListener("blur", hidePointer);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="active"
      ref="cursorElement"
      class="global-map-loading-cursor"
      :class="{ 'global-map-loading-cursor--still': reduceMotion }"
      role="progressbar"
      :aria-label="label"
      :aria-valuenow="percentage ?? undefined"
      :aria-valuetext="label"
      aria-valuemin="0"
      aria-valuemax="100"
      data-testid="global-map-loading-cursor"
    >
      <svg class="global-map-loading-cursor__base" viewBox="0 0 40 40" aria-hidden="true">
        <circle class="global-map-loading-cursor__outline" cx="20" cy="20" r="15" />
        <circle class="global-map-loading-cursor__track" cx="20" cy="20" r="15" />
      </svg>
      <span class="global-map-loading-cursor__rotor" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <circle class="global-map-loading-cursor__outline" cx="20" cy="20" r="15" pathLength="100" :stroke-dasharray="`${arcLength} 100`" />
          <circle class="global-map-loading-cursor__arc" cx="20" cy="20" r="15" pathLength="100" :stroke-dasharray="`${arcLength} 100`" />
        </svg>
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
.global-map-loading-cursor {
  position: fixed;
  z-index: 10000;
  width: 34px;
  height: 34px;
  pointer-events: none;
  border-radius: 50%;
  background: transparent;
  color: var(--idfm-blue, #6500ff);
}
.global-map-loading-cursor--fixed { right: 24px; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
svg { display: block; width: 100%; height: 100%; overflow: visible; transform: rotate(-90deg); }
circle { fill: none; stroke-linecap: round; }
.global-map-loading-cursor__rotor { display: block; width: 100%; height: 100%; will-change: transform; animation: city-cursor-spin 0.8s linear infinite; }
.global-map-loading-cursor__base { position: absolute; inset: 0; }
.global-map-loading-cursor__track { stroke: color-mix(in srgb, currentColor 25%, white); stroke-width: 5; }
.global-map-loading-cursor__outline { stroke: #fff; stroke-width: 8; }
.global-map-loading-cursor__arc { stroke: currentColor; stroke-width: 5; }
@keyframes city-cursor-spin { to { transform: rotate(360deg); } }
.global-map-loading-cursor--still .global-map-loading-cursor__rotor { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .global-map-loading-cursor__rotor { animation: none; }
}
</style>
