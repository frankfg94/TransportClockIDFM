<script setup lang="ts">
import { Ruler } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    reduceMotion?: boolean;
  }>(),
  {
    reduceMotion: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

function toggle(): void {
  emit("update:modelValue", !props.modelValue);
}
</script>

<template>
  <button
    class="distance-toggle"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    aria-label="Afficher les distances entre les stations"
    @click.stop="toggle"
  >
    <Ruler aria-hidden="true" />
    <span>Distances</span>
    <i class="distance-toggle__track" aria-hidden="true"></i>
  </button>
</template>

<style scoped>
.distance-toggle[aria-checked="true"] {
  background: #05070c;
  color: #ffffff;
}

.distance-toggle__track {
  background: #cbd5e1;
  border-radius: 999px;
  display: block;
  flex: 0 0 auto;
  height: 20px;
  position: relative;
  transition: background 160ms ease;
  width: 34px;
}

.distance-toggle__track::after {
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(16, 35, 63, 0.28);
  content: "";
  height: 14px;
  left: 3px;
  position: absolute;
  top: 3px;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
  width: 14px;
}

.distance-toggle[aria-checked="true"] .distance-toggle__track {
  background: var(--line-color, var(--idfm-blue, #0064ff));
}

.distance-toggle[aria-checked="true"] .distance-toggle__track::after {
  transform: translateX(14px);
}

@media (prefers-reduced-motion: reduce) {
  .distance-toggle__track::after {
    transition-duration: 1ms;
  }
}
</style>
