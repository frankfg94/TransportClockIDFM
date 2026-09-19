<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../i18n";

const props = withDefaults(
  defineProps<{
    /** Diameter in pixels. */
    size?: number;
    /** Ring thickness in pixels. */
    thickness?: number;
    /** Accessible label; falls back to the shared loading message. */
    label?: string;
  }>(),
  {
    size: 16,
    thickness: 2,
    label: "",
  },
);

const { t } = useI18n();
const accessibleLabel = computed(() => props.label || t("common.states.loading"));
const spinnerStyle = computed(() => ({
  "--spinner-size": `${props.size}px`,
  "--spinner-thickness": `${props.thickness}px`,
}));
</script>

<template>
  <span
    class="spinner"
    :style="spinnerStyle"
    role="status"
    :aria-label="accessibleLabel"
    data-testid="spinner"
  >
    <span class="spinner__circle" aria-hidden="true" />
  </span>
</template>

<style scoped>
.spinner {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  height: var(--spinner-size);
  justify-content: center;
  line-height: 0;
  vertical-align: middle;
  width: var(--spinner-size);
}

.spinner__circle {
  animation: spinner-rotate 720ms linear infinite;
  border: var(--spinner-thickness) solid currentColor;
  border-radius: 50%;
  border-top-color: transparent;
  box-sizing: border-box;
  display: block;
  height: 100%;
  opacity: .8;
  width: 100%;
}

@keyframes spinner-rotate {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner__circle { animation-duration: 2.4s; }
}
</style>
