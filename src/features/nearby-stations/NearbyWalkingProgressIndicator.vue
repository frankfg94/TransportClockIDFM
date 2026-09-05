<script setup lang="ts">
import { computed } from "vue";
import { Check } from "lucide-vue-next";

const CIRCUMFERENCE = 2 * Math.PI * 8;

const props = withDefaults(
  defineProps<{
    active?: boolean;
    complete?: boolean;
    label: string;
  }>(),
  {
    active: false,
    complete: false,
  },
);

const visible = computed(() => props.active || props.complete);
const circleStyle = computed<Record<string, string>>(() =>
  props.complete
    ? {
        strokeDasharray: `${CIRCUMFERENCE} ${CIRCUMFERENCE}`,
        strokeDashoffset: `${CIRCUMFERENCE}`,
      }
    : {
        strokeDasharray: "14 50",
        strokeDashoffset: "0",
      },
);
</script>

<template>
  <span
    class="nearby-directory__group-progress"
    :class="{
      'nearby-directory__group-progress--active': active,
      'nearby-directory__group-progress--complete': complete,
      'nearby-directory__group-progress--hidden': !visible,
    }"
    :role="visible ? 'status' : undefined"
    :aria-hidden="visible ? undefined : 'true'"
    :aria-label="visible ? label : undefined"
  >
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle class="nearby-directory__group-progress-track" cx="10" cy="10" r="8" />
      <circle
        class="nearby-directory__group-progress-bar"
        cx="10"
        cy="10"
        r="8"
        :style="circleStyle"
      />
    </svg>
    <Check
      v-if="complete"
      class="nearby-directory__group-progress-check"
      :size="8"
      :stroke-width="3"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.nearby-directory__group-progress {
  align-items: center;
  color: var(--directory-tone);
  display: inline-flex;
  height: 18px;
  justify-content: center;
  justify-self: end;
  opacity: 1;
  position: relative;
  transform: scale(1);
  transition:
    opacity 110ms ease,
    transform 110ms ease;
  width: 18px;
}
.nearby-directory__group-progress--hidden {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.82);
}
.nearby-directory__group-progress > svg:first-child {
  display: block;
  height: 18px;
  transform: rotate(-90deg);
  width: 18px;
}
.nearby-directory__group-progress-track,
.nearby-directory__group-progress-bar {
  fill: none;
  stroke-width: 2.4;
}
.nearby-directory__group-progress-track {
  opacity: 0.2;
  stroke: currentColor;
}
.nearby-directory__group-progress-bar {
  stroke: currentColor;
  stroke-linecap: round;
  transition: none;
}
.nearby-directory__group-progress--active svg {
  animation: nearby-directory-progress-spin 900ms linear infinite;
}
.nearby-directory__group-progress--complete .nearby-directory__group-progress-bar {
  animation: nearby-directory-progress-fill 260ms ease-out forwards;
}
.nearby-directory__group-progress-check {
  height: 8px;
  inset: 0;
  margin: auto;
  opacity: 0;
  position: absolute;
  transform: scale(0.55);
  width: 8px;
}
.nearby-directory__group-progress--complete .nearby-directory__group-progress-check {
  animation: nearby-directory-check-appear 140ms ease-out 180ms forwards;
}
@media (prefers-reduced-motion: reduce) {
  .nearby-directory__group-progress {
    transition: none;
  }
  .nearby-directory__group-progress--active svg {
    animation: none;
  }
  .nearby-directory__group-progress--complete .nearby-directory__group-progress-bar {
    animation: none;
    stroke-dashoffset: 0;
  }
  .nearby-directory__group-progress--complete .nearby-directory__group-progress-check {
    animation: none;
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes nearby-directory-progress-spin {
  from {
    transform: rotate(-90deg);
  }
  to {
    transform: rotate(270deg);
  }
}
@keyframes nearby-directory-progress-fill {
  from {
    stroke-dashoffset: 50.2655;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes nearby-directory-check-appear {
  from {
    opacity: 0;
    transform: scale(0.55);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
