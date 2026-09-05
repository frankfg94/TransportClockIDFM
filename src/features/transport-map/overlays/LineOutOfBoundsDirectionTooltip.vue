<script setup lang="ts">
const props = withDefaults(defineProps<{
  x: number;
  y: number;
  side: "top" | "right" | "bottom" | "left";
  angleDeg?: number;
  color: string;
  destination: string;
  destinationCity?: string;
  fullscreen?: boolean;
  traceActionLabel?: string;
  traceActionVisible?: boolean;
}>(), {
  angleDeg: 0,
  destinationCity: "",
  fullscreen: false,
  traceActionLabel: "",
  traceActionVisible: false,
});

const emit = defineEmits<{ viewTrace: [] }>();
</script>

<template>
  <div
    class="line-out-of-bounds-direction-tooltip transport-ghost-flow__exit"
    :class="[
      `transport-ghost-flow__exit--${props.side}`,
      { 'transport-ghost-flow__exit--fullscreen': props.fullscreen },
    ]"
    :style="{
      left: `${props.x}px`,
      top: `${props.y}px`,
      '--ghost-flow-color': props.color,
      '--ghost-flow-exit-angle': `${props.angleDeg}deg`,
    }"
    role="note"
  >
    <span class="transport-ghost-flow__exit-content">
      <span class="transport-ghost-flow__exit-direction">{{ props.destination }}</span>
      <span v-if="props.destinationCity" class="transport-ghost-flow__exit-city">
        {{ props.destinationCity }}
      </span>
      <button
        v-if="props.traceActionLabel && props.traceActionVisible"
        class="transport-ghost-flow__trace-action"
        type="button"
        @click.stop="emit('viewTrace')"
      >
        {{ props.traceActionLabel }}
      </button>
    </span>
  </div>
</template>

<style scoped>
.transport-ghost-flow__exit { --ghost-flow-exit-overflow-x: 0px; --ghost-flow-exit-overflow-y: 0px; align-items: center; backdrop-filter: blur(4px); background: #fff; border: 1px solid color-mix(in srgb, var(--ghost-flow-color) 45%, white); border-radius: 12px; box-shadow: 0 3px 10px rgba(16, 35, 63, .12); box-sizing: border-box; color: var(--ghost-flow-color); display: flex; font-size: .7rem; font-weight: 850; max-width: min(240px, calc(100% - 18px)); min-width: min(180px, calc(100% - 18px)); padding: 5px 9px; pointer-events: none; position: absolute; width: min(240px, calc(100% - 18px)); white-space: normal; z-index: 4; }
.transport-ghost-flow__exit--fullscreen { border-radius: 14px; font-size: .82rem; max-width: min(300px, calc(100% - 24px)); min-width: min(240px, calc(100% - 24px)); padding: 8px 12px; width: min(300px, calc(100% - 24px)); }
.transport-ghost-flow__exit-content { display: grid; gap: 1px; min-width: 0; }
.transport-ghost-flow__exit-direction { overflow-wrap: break-word; }
.transport-ghost-flow__exit-city { color: color-mix(in srgb, var(--ghost-flow-color) 65%, #1d2635); font-size: .64rem; font-weight: 720; overflow-wrap: break-word; }
.transport-ghost-flow__trace-action { background: transparent; border: 0; color: var(--ghost-flow-color); cursor: pointer; font-size: .64rem; font-weight: 900; justify-self: start; margin: 2px 0 0; min-height: 22px; padding: 1px 0; pointer-events: auto; text-decoration: underline; }
.transport-ghost-flow__trace-action:hover, .transport-ghost-flow__trace-action:focus-visible { color: color-mix(in srgb, var(--ghost-flow-color) 75%, #18233f); outline: 0; text-decoration-thickness: 2px; }
.transport-ghost-flow__exit--top { transform: translate(calc(-50% + var(--ghost-flow-exit-overflow-x)), var(--ghost-flow-exit-overflow-y)); }
.transport-ghost-flow__exit--right { justify-content: flex-end; text-align: right; transform: translate(calc(-100% + var(--ghost-flow-exit-overflow-x)), calc(-50% + var(--ghost-flow-exit-overflow-y))); }
.transport-ghost-flow__exit--bottom { transform: translate(calc(-50% + var(--ghost-flow-exit-overflow-x)), calc(-100% + var(--ghost-flow-exit-overflow-y))); }
.transport-ghost-flow__exit--left { justify-content: flex-start; text-align: left; transform: translate(var(--ghost-flow-exit-overflow-x), calc(-50% + var(--ghost-flow-exit-overflow-y))); }
.transport-ghost-flow__exit::before { background: currentColor; content: ""; height: 5px; opacity: .58; position: absolute; width: 5px; }
.transport-ghost-flow__exit--top::before { left: 50%; top: -3px; transform: translateX(-50%) rotate(45deg); }
.transport-ghost-flow__exit--right::before { left: -3px; top: 50%; transform: translateY(-50%) rotate(45deg); }
.transport-ghost-flow__exit--bottom::before { bottom: -3px; left: 50%; transform: translateX(-50%) rotate(45deg); }
.transport-ghost-flow__exit--left::before { right: -3px; top: 50%; transform: translateY(-50%) rotate(45deg); }
</style>
