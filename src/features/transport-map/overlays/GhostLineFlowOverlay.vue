<script setup lang="ts">
import type { GhostLineFlowModel } from "./ghostLineFlow";
import LineOutOfBoundsDirectionTooltip from "./LineOutOfBoundsDirectionTooltip.vue";

const props = withDefaults(defineProps<{
  model: GhostLineFlowModel;
  directionLabel?: (destination: string) => string;
  terminusLabel: string;
  fullscreen?: boolean;
  traceActionLabel?: string;
}>(), {
  directionLabel: (destination: string) => destination,
  fullscreen: false,
  traceActionLabel: "",
});

const emit = defineEmits<{
  viewTrace: [directionId: string];
}>();
</script>

<template>
  <svg
    class="transport-ghost-flow"
    :viewBox="`0 0 ${props.model.width} ${props.model.height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g :style="{ '--ghost-flow-color': props.model.color, '--ghost-flow-width': `${props.model.strokeWidth}px` }">
      <path
        v-for="path in props.model.paths"
        :key="`base:${path.key}`"
        class="transport-ghost-flow__path"
        :d="path.d"
      />
      <path
        v-for="path in props.model.wavePaths"
        :key="`wave:${path.key}`"
        class="transport-ghost-flow__wave"
        :d="path.d"
        :style="{ animationDelay: `${path.animationDelayMs}ms` }"
      />
      <path
        v-for="chevron in props.model.chevrons"
        :key="chevron.key"
        class="transport-ghost-flow__chevron"
        d="M -5 -4 L 0 0 L -5 4"
        :transform="`translate(${chevron.x} ${chevron.y}) rotate(${chevron.angleDeg})`"
      />
    </g>
  </svg>

  <LineOutOfBoundsDirectionTooltip
    v-for="exit in props.model.exits"
    :key="exit.key"
    :x="exit.x"
    :y="exit.y"
    :side="exit.side"
    :angle-deg="exit.angleDeg"
    :color="props.model.color"
    :destination="props.directionLabel(exit.destination)"
    :destination-city="exit.destinationCity"
    :fullscreen="props.fullscreen"
    :trace-action-label="props.traceActionLabel"
    :trace-action-visible="props.model.lineMode === 'BUS' || props.model.lineMode === 'NOCTILIEN' || props.model.lineMode === 'TRAM'"
    @view-trace="emit('viewTrace', exit.directionId)"
  />

  <div
    v-for="terminus in props.model.termini"
    :key="terminus.key"
    class="transport-ghost-flow__terminus"
    :class="{ 'transport-ghost-flow__terminus--fullscreen': props.fullscreen }"
    :style="{
      left: `${terminus.x}px`,
      top: `${terminus.y}px`,
      '--ghost-flow-color': props.model.color,
    }"
    role="note"
  >
    <span class="transport-ghost-flow__terminus-label">{{ props.terminusLabel }}</span>
    <span class="transport-ghost-flow__terminus-dot" aria-hidden="true" />
  </div>
</template>

<style scoped>
.transport-ghost-flow { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 3; }
.transport-ghost-flow g { color: var(--ghost-flow-color); }
.transport-ghost-flow__path { fill: none; opacity: .2; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: var(--ghost-flow-width); }
.transport-ghost-flow__wave { fill: none; opacity: .36; stroke: currentColor; stroke-dasharray: 5 28; stroke-linecap: round; stroke-linejoin: round; stroke-width: max(1.5px, calc(var(--ghost-flow-width) * .62)); animation: transport-ghost-flow-wave 3.2s linear infinite; }
.transport-ghost-flow__chevron { display: none; fill: none; opacity: .54; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8px; }
.transport-ghost-flow__terminus { --ghost-flow-terminus-overflow-x: 0px; --ghost-flow-terminus-overflow-y: 0px; align-items: center; color: var(--ghost-flow-color); display: flex; flex-direction: column; gap: 4px; pointer-events: none; position: absolute; transform: translate(calc(-50% + var(--ghost-flow-terminus-overflow-x)), calc(-100% + 6px + var(--ghost-flow-terminus-overflow-y))); white-space: nowrap; z-index: 6; }
.transport-ghost-flow__terminus-dot { background: var(--ghost-flow-color); border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px color-mix(in srgb, var(--ghost-flow-color) 55%, transparent), 0 2px 5px rgba(16, 35, 63, .25); height: 12px; opacity: .9; width: 12px; }
.transport-ghost-flow__terminus-label { color: var(--ghost-flow-color); font-size: .7rem; font-weight: 900; text-shadow: 0 0 2px #fff, 0 1px 5px rgba(255, 255, 255, .95); }
.transport-ghost-flow__terminus--fullscreen { transform: translate(calc(-50% + var(--ghost-flow-terminus-overflow-x)), calc(-100% + 7px + var(--ghost-flow-terminus-overflow-y))); }
.transport-ghost-flow__terminus--fullscreen .transport-ghost-flow__terminus-dot { height: 14px; width: 14px; }
.transport-ghost-flow__terminus--fullscreen .transport-ghost-flow__terminus-label { font-size: .82rem; }
@keyframes transport-ghost-flow-wave { to { stroke-dashoffset: -132px; } }
@media (prefers-reduced-motion: reduce) {
  .transport-ghost-flow__wave { display: none; }
  .transport-ghost-flow__chevron { display: block; }
}
</style>
