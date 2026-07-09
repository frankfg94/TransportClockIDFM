<script setup lang="ts">
import { TriangleAlert } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    active: boolean;
    count: number;
    label?: string;
    nextDelayLabel?: string;
    reduceMotion?: boolean;
    urgent?: boolean;
  }>(),
  {
    label: "Trafic",
    nextDelayLabel: "",
    reduceMotion: false,
    urgent: false,
  },
);

defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <button
    class="pattern-traffic-timeline-toggle"
    :class="{
      'pattern-traffic-timeline-toggle--active': active,
      'pattern-traffic-timeline-toggle--urgent': urgent,
      'pattern-traffic-timeline-toggle--reduce-motion': reduceMotion,
    }"
    type="button"
    :aria-pressed="active"
    @click.stop="$emit('toggle')"
  >
    <span class="pattern-traffic-timeline-toggle__icon" aria-hidden="true">
      <TriangleAlert />
    </span>
    <span class="pattern-traffic-timeline-toggle__label">{{ props.label }}</span>
    <span class="pattern-traffic-timeline-toggle__count">{{ count }}</span>
    <span
      v-if="nextDelayLabel"
      class="pattern-traffic-timeline-toggle__delay"
    >
      {{ nextDelayLabel }}
    </span>
  </button>
</template>

<style scoped>
.pattern-traffic-timeline-toggle {
  --traffic-toggle-border: rgba(16, 35, 63, 0.14);
  align-items: center;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    linear-gradient(120deg, var(--traffic-toggle-border), var(--traffic-toggle-border))
      border-box;
  border: 1px solid transparent;
  border-radius: 999px;
  box-shadow: 0 12px 30px rgba(16, 35, 63, 0.16);
  color: #18142f;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 950;
  gap: 7px;
  min-height: 38px;
  padding: 0 9px 0 11px;
  position: relative;
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
}

.pattern-traffic-timeline-toggle:hover,
.pattern-traffic-timeline-toggle:focus-visible {
  box-shadow: 0 16px 38px rgba(16, 35, 63, 0.22);
  transform: translateY(-1px);
}

.pattern-traffic-timeline-toggle--active {
  background:
    linear-gradient(135deg, #120d2b, #05070c) padding-box,
    linear-gradient(120deg, rgba(255, 255, 255, 0.22), rgba(176, 0, 103, 0.6))
      border-box;
  color: #ffffff;
}

.pattern-traffic-timeline-toggle--urgent {
  animation: traffic-toggle-gradient-wave 2.8s linear infinite;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    linear-gradient(
        120deg,
        rgba(176, 0, 103, 0.22),
        rgba(255, 212, 0, 0.9),
        rgba(176, 0, 103, 0.38),
        rgba(37, 99, 235, 0.5),
        rgba(176, 0, 103, 0.22)
      )
      border-box;
  background-size: 100% 100%, 240% 240%;
  box-shadow:
    0 16px 38px rgba(16, 35, 63, 0.2),
    0 0 0 4px rgba(255, 212, 0, 0.08);
}

.pattern-traffic-timeline-toggle--urgent.pattern-traffic-timeline-toggle--active {
  background:
    linear-gradient(135deg, #120d2b, #05070c) padding-box,
    linear-gradient(
        120deg,
        rgba(255, 255, 255, 0.26),
        rgba(255, 212, 0, 0.95),
        rgba(176, 0, 103, 0.82),
        rgba(37, 99, 235, 0.72),
        rgba(255, 255, 255, 0.26)
      )
      border-box;
  background-size: 100% 100%, 240% 240%;
}

.pattern-traffic-timeline-toggle--reduce-motion,
.pattern-traffic-timeline-toggle--reduce-motion::before {
  animation: none;
}

.pattern-traffic-timeline-toggle__icon {
  align-items: center;
  color: #b00067;
  display: inline-flex;
}

.pattern-traffic-timeline-toggle--active .pattern-traffic-timeline-toggle__icon {
  color: #ffd400;
}

.pattern-traffic-timeline-toggle__icon svg {
  height: 17px;
  width: 17px;
}

.pattern-traffic-timeline-toggle__label {
  line-height: 1;
}

.pattern-traffic-timeline-toggle__count,
.pattern-traffic-timeline-toggle__delay {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.7rem;
  justify-content: center;
  line-height: 1;
  min-height: 22px;
  min-width: 28px;
  padding: 0 8px;
}

.pattern-traffic-timeline-toggle__count {
  background: #b00067;
  color: #ffffff;
}

.pattern-traffic-timeline-toggle__delay {
  background: #eef2ff;
  color: #4f46e5;
}

.pattern-traffic-timeline-toggle--active
  .pattern-traffic-timeline-toggle__delay {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

@keyframes traffic-toggle-gradient-wave {
  0% {
    background-position:
      0 0,
      0% 50%;
  }

  100% {
    background-position:
      0 0,
      240% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pattern-traffic-timeline-toggle {
    animation: none;
  }
}
</style>
