<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    progress?: number | null;
    indeterminate?: boolean;
    ariaLabel?: string;
  }>(),
  {
    progress: undefined,
    indeterminate: false,
    ariaLabel: "",
  },
);

const normalizedProgress = computed<number | undefined>(() => {
  if (
    props.indeterminate ||
    typeof props.progress !== "number" ||
    !Number.isFinite(props.progress)
  ) {
    return undefined;
  }

  return Math.min(100, Math.max(0, props.progress));
});

const barStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  if (normalizedProgress.value !== undefined) {
    style.width = `${normalizedProgress.value}%`;
  }
  return style;
});
</script>

<template>
  <div
    class="loading-bar"
    :class="{ 'loading-bar--indeterminate': normalizedProgress === undefined }"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="normalizedProgress"
    :aria-label="ariaLabel || undefined"
  >
    <span class="loading-bar__value" :style="barStyle" />
  </div>
</template>

<style scoped>
.loading-bar {
  --loading-bar-color: var(--idfm-blue);
  display: block;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--loading-bar-color), transparent 82%);
}

.loading-bar__value {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--loading-bar-color);
  transition: width 180ms ease-out;
}

.loading-bar--indeterminate .loading-bar__value {
  width: 36%;
  animation: loading-bar-indeterminate 1.2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .loading-bar__value {
    transition: none;
  }

  .loading-bar--indeterminate .loading-bar__value {
    width: 45%;
    animation: none;
  }
}

@keyframes loading-bar-indeterminate {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(300%);
  }
}
</style>
