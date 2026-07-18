<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../i18n";

export type LoadingClockDirection = "future" | "past" | "idle";

const props = withDefaults(
  defineProps<{
    direction?: LoadingClockDirection;
    label?: string;
    size?: "small" | "medium";
    overlay?: boolean;
  }>(),
  {
    direction: "idle",
    label: "",
    size: "small",
    overlay: false,
  },
);

const { t } = useI18n();
const accessibleLabel = computed(
  () =>
    props.label ||
    t(
      props.direction === "future"
        ? "pattern.trafficCalendarLoadingFuture"
        : props.direction === "past"
          ? "pattern.trafficCalendarLoadingPast"
          : "pattern.trafficCalendarLoading",
    ),
);
</script>

<template>
  <span
    class="loading-clock"
    :class="[
      `loading-clock--${direction}`,
      `loading-clock--${size}`,
      { 'loading-clock--overlay': overlay },
    ]"
    role="status"
    aria-live="polite"
    :aria-label="accessibleLabel"
    data-testid="loading-clock"
  >
    <span class="loading-clock__stage" aria-hidden="true">
      <span class="loading-clock__halo loading-clock__halo--outer"></span>
      <span class="loading-clock__halo loading-clock__halo--inner"></span>
      <span class="loading-clock__orbit">
        <span class="loading-clock__orbit-dot"></span>
      </span>
      <span class="loading-clock__face">
        <span class="loading-clock__center"></span>
        <span class="loading-clock__hand loading-clock__hand--hour"></span>
        <span class="loading-clock__hand loading-clock__hand--minute"></span>
      </span>
    </span>
    <span v-if="overlay" class="loading-clock__caption" aria-hidden="true">
      {{ accessibleLabel }}
    </span>
    <span class="sr-only">{{ accessibleLabel }}</span>
  </span>
</template>

<style scoped>
.loading-clock {
  --loading-clock-accent: #b00067;
  --loading-clock-ink: #30284f;
  --loading-clock-size: 28px;
  align-items: center;
  display: inline-flex;
  justify-content: center;
}

.loading-clock--medium { --loading-clock-size: 42px; }

.loading-clock__stage {
  display: grid;
  place-items: center;
  position: relative;
}

.loading-clock__face {
  background:
    radial-gradient(circle at 34% 28%, #ffffff 0 5%, transparent 18%),
    radial-gradient(circle at center, #ffffff 0 10%, transparent 11%),
    repeating-conic-gradient(from -1deg, rgba(176, 0, 103, 0.8) 0 2deg, transparent 2deg 30deg),
    linear-gradient(145deg, #fff8fc, #f6ebff);
  border: max(2px, calc(var(--loading-clock-size) * 0.06)) solid var(--loading-clock-accent);
  border-radius: 50%;
  box-shadow: 0 12px 30px rgba(109, 40, 217, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  grid-area: 1 / 1;
  height: var(--loading-clock-size);
  position: relative;
  width: var(--loading-clock-size);
  z-index: 2;
}

.loading-clock__center {
  background: var(--loading-clock-accent);
  border: max(1px, calc(var(--loading-clock-size) * 0.04)) solid #ffffff;
  border-radius: 50%;
  height: calc(var(--loading-clock-size) * 0.24);
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(var(--loading-clock-size) * 0.24);
  z-index: 3;
}

.loading-clock__hand {
  background: var(--loading-clock-ink);
  border-radius: 999px;
  bottom: 50%;
  left: calc(50% - max(1px, calc(var(--loading-clock-size) * 0.025)));
  position: absolute;
  transform-origin: 50% 100%;
  width: max(2px, calc(var(--loading-clock-size) * 0.06));
}

.loading-clock__hand--hour { height: 25%; transform: rotate(45deg); }
.loading-clock__hand--minute {
  animation: loading-clock-forward 760ms cubic-bezier(0.55, 0, 0.45, 1) infinite;
  background: var(--loading-clock-accent);
  height: 37%;
}
.loading-clock--past .loading-clock__hand--minute { animation-name: loading-clock-backward; }
.loading-clock--idle .loading-clock__hand--minute { animation: none; transform: rotate(12deg); }

.loading-clock__halo,
.loading-clock__orbit { display: none; }

.loading-clock--overlay {
  --loading-clock-size: clamp(118px, 16vw, 176px);
  background:
    radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.94), transparent 28rem),
    linear-gradient(135deg, rgba(25, 17, 55, 0.66), rgba(87, 20, 86, 0.59));
  backdrop-filter: blur(14px) saturate(1.15);
  display: grid;
  inset: 0;
  justify-items: center;
  padding: 24px;
  position: fixed;
  z-index: 100000;
}

.loading-clock--overlay .loading-clock__stage {
  animation: loading-clock-float 2.4s ease-in-out infinite;
  height: calc(var(--loading-clock-size) * 1.9);
  width: calc(var(--loading-clock-size) * 1.9);
}
.loading-clock--overlay .loading-clock__face { animation: loading-clock-face-glow 1.9s ease-in-out infinite; }
.loading-clock--overlay .loading-clock__halo,
.loading-clock--overlay .loading-clock__orbit { display: block; grid-area: 1 / 1; position: absolute; }
.loading-clock__halo { border: 1px solid rgba(255, 255, 255, 0.48); border-radius: 50%; }
.loading-clock__halo--outer {
  animation: loading-clock-pulse 2.2s ease-out infinite;
  box-shadow: 0 0 58px rgba(245, 158, 11, 0.32);
  height: 100%; width: 100%;
}
.loading-clock__halo--inner {
  animation: loading-clock-pulse 2.2s 0.7s ease-out infinite;
  height: 72%; width: 72%;
}
.loading-clock__orbit {
  animation: loading-clock-forward 2.7s linear infinite;
  border: 1px dashed rgba(255, 255, 255, 0.72);
  border-radius: 50%; height: 138%; width: 138%;
}
.loading-clock--past .loading-clock__orbit { animation-name: loading-clock-backward; }
.loading-clock__orbit-dot {
  background: #fbbf24;
  border: 3px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.92);
  height: 12px; position: absolute; right: 8%; top: 8%; width: 12px;
}
.loading-clock__caption {
  color: #ffffff;
  font-size: clamp(0.9rem, 1.7vw, 1.08rem);
  font-weight: 800;
  letter-spacing: 0.01em;
  margin-top: -8px;
  max-width: 24rem;
  text-align: center;
  text-shadow: 0 2px 15px rgba(20, 10, 40, 0.5);
}

@keyframes loading-clock-forward { to { transform: rotate(360deg); } }
@keyframes loading-clock-backward { to { transform: rotate(-360deg); } }
@keyframes loading-clock-float { 50% { transform: translateY(-8px); } }
@keyframes loading-clock-face-glow {
  50% { box-shadow: 0 18px 42px rgba(109, 40, 217, 0.4), 0 0 0 14px rgba(255, 255, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.92); }
}
@keyframes loading-clock-pulse {
  0% { opacity: 0.7; transform: scale(0.72); }
  75%, 100% { opacity: 0; transform: scale(1.08); }
}

.loading-clock-overlay-enter-active,
.loading-clock-overlay-leave-active { transition: opacity 180ms ease; }
.loading-clock-overlay-enter-from,
.loading-clock-overlay-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .loading-clock__hand--minute,
  .loading-clock--overlay .loading-clock__stage,
  .loading-clock--overlay .loading-clock__face,
  .loading-clock--overlay .loading-clock__halo,
  .loading-clock--overlay .loading-clock__orbit { animation: none; }
  .loading-clock__hand--minute { transform: rotate(12deg); }
}
</style>

