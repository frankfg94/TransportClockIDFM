<script setup lang="ts">
import { ref, watch } from "vue";
import { TrafficCone } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import type { LineConfig } from "../../types/transit";
import type { TrafficAlertSymbol, TrafficTone } from "./trafficPresentation";
import type { TrafficLineStatus } from "./types";

type LineTrafficSymbol = TrafficAlertSymbol | "roadwork" | "";

const props = withDefaults(
  defineProps<{
    animationOrder?: number;
    line: LineConfig;
    ready?: boolean;
    status: TrafficLineStatus;
    symbol?: LineTrafficSymbol;
    tone?: TrafficTone;
  }>(),
  {
    animationOrder: 0,
    ready: false,
    symbol: "",
  },
);

const entersOnMount = !props.ready;
const animatesReport = ref(false);

watch(
  () => props.ready,
  (ready, wasReady) => {
    if (ready && !wasReady) {
      animatesReport.value = true;
    }
  },
);
</script>

<template>
  <span
    class="line-traffic-icon"
    aria-hidden="true"
    :class="[
      `line-traffic-icon--${status}`,
      tone ? `line-traffic-icon--tone-${tone}` : undefined,
      {
        'line-traffic-icon--entering': entersOnMount,
        'line-traffic-icon--ready': ready,
        'line-traffic-icon--report-arriving': animatesReport,
      },
    ]"
    :style="{ '--line-traffic-animation-order': animationOrder }"
  >
    <span class="line-traffic-icon__frame" aria-hidden="true">
      <svg viewBox="0 0 48 48" preserveAspectRatio="none">
        <rect
          x="1"
          y="1"
          width="46"
          height="46"
          rx="7"
          pathLength="100"
          stroke-dasharray="102 100"
        />
      </svg>
    </span>

    <LineIconBadge :line="line" compact />

    <span
      v-if="symbol"
      class="line-traffic-icon__status"
      :class="{
        'line-traffic-icon__status--roadwork': symbol === 'roadwork',
      }"
    >
      <TrafficCone
        v-if="symbol === 'roadwork'"
        :size="18"
        fill="white"
        aria-hidden="true"
      />
      <template v-else>{{ symbol }}</template>
    </span>
  </span>
</template>

<style scoped>
.line-traffic-icon {
  --line-traffic-animation-order: 0;
  --line-traffic-frame-color: #3ca70d;
  align-items: center;
  display: inline-flex;
  height: 48px;
  justify-content: center;
  position: relative;
  width: 48px;
}

.line-traffic-icon--planned,
.line-traffic-icon--information {
  --line-traffic-frame-color: #d49400;
}

.line-traffic-icon--disrupted,
.line-traffic-icon--error {
  --line-traffic-frame-color: #e63214;
}

.line-traffic-icon--tone-orange {
  --line-traffic-frame-color: #f59e0b;
}

.line-traffic-icon--tone-red {
  --line-traffic-frame-color: #e63214;
}

.line-traffic-icon--unknown {
  --line-traffic-frame-color: #c8ceda;
}

.line-traffic-icon__frame {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.line-traffic-icon__frame svg {
  display: block;
  height: 100%;
  overflow: visible;
  width: 100%;
}

.line-traffic-icon__frame rect {
  fill: none;
  opacity: 0;
  stroke: var(--line-traffic-frame-color);
  stroke-dashoffset: 102;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  transition: stroke 260ms ease;
  vector-effect: non-scaling-stroke;
}

.line-traffic-icon--ready .line-traffic-icon__frame rect {
  opacity: 1;
  stroke-dashoffset: 0;
}

.line-traffic-icon--report-arriving .line-traffic-icon__frame {
  animation: line-traffic-frame-glow 940ms ease-out both;
  animation-delay: calc(
    140ms + (var(--line-traffic-animation-order) * 32ms)
  );
}

.line-traffic-icon--report-arriving .line-traffic-icon__frame rect {
  animation: line-traffic-frame-draw 520ms cubic-bezier(0.22, 1, 0.36, 1)
    both;
  animation-delay: calc(
    140ms + (var(--line-traffic-animation-order) * 32ms)
  );
}

.line-traffic-icon :deep(.line-icon-badge) {
  height: 36px;
  justify-content: center;
  min-width: 36px;
  position: relative;
  z-index: 1;
}

.line-traffic-icon--entering :deep(.line-icon-badge) {
  animation: line-traffic-icon-arrive 420ms cubic-bezier(0.16, 1, 0.3, 1)
    both;
  animation-delay: calc(
    40ms + (var(--line-traffic-animation-order) * 28ms)
  );
}

.line-traffic-icon :deep(.line-icon-badge img) {
  max-height: 36px;
  max-width: 42px;
}

.line-traffic-icon :deep(.line-icon-badge__fallback) {
  border: 0;
  height: 34px;
}

.line-traffic-icon :deep(.line-icon-badge__label) {
  font-size: 1.05rem;
  min-width: 34px;
  padding: 0 6px;
}

.line-traffic-icon__status {
  align-items: center;
  background: #e63214;
  border-radius: 999px;
  bottom: -3px;
  color: #ffffff;
  display: inline-flex;
  font-size: 1rem;
  font-weight: bold;
  height: 18px;
  justify-content: center;
  line-height: 14px;
  position: absolute;
  right: -3px;
  text-align: center;
  width: 18px;
  z-index: 2;
}

.line-traffic-icon--report-arriving .line-traffic-icon__status {
  animation: line-traffic-status-arrive 460ms cubic-bezier(0.16, 1, 0.3, 1)
    both;
  animation-delay: calc(
    590ms + (var(--line-traffic-animation-order) * 32ms)
  );
}

.line-traffic-icon__status--roadwork {
  background: transparent;
  border: 0;
  bottom: -2px;
  box-shadow: none;
  color: #8b8f99;
  height: 18px;
  right: -4px;
  width: 18px;
}

.line-traffic-icon__status--roadwork svg {
  height: 23px;
  stroke-width: 2.5;
  width: 23px;
}

.line-traffic-icon--planned .line-traffic-icon__status,
.line-traffic-icon--information .line-traffic-icon__status {
  background: #f7b500;
}

.line-traffic-icon--tone-orange .line-traffic-icon__status {
  background: #f59e0b;
}

.line-traffic-icon--tone-red .line-traffic-icon__status {
  background: #e63214;
}

@keyframes line-traffic-icon-arrive {
  0% {
    opacity: 0;
    transform: translateY(7px) scale(0.86);
  }

  62% {
    opacity: 1;
    transform: translateY(-1px) scale(1.035);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes line-traffic-frame-draw {
  0% {
    opacity: 0;
    stroke-dashoffset: 102;
  }

  12% {
    opacity: 1;
  }

  100% {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}

@keyframes line-traffic-frame-glow {
  0%,
  42% {
    filter: drop-shadow(0 0 0 transparent);
  }

  72% {
    filter: drop-shadow(0 0 3px var(--line-traffic-frame-color));
  }

  100% {
    filter: drop-shadow(0 0 0 transparent);
  }
}

@keyframes line-traffic-status-arrive {
  0% {
    opacity: 0;
    transform: translate(3px, 3px) scale(0.35) rotate(12deg);
  }

  68% {
    opacity: 1;
    transform: translate(0, 0) scale(1.12) rotate(-2deg);
  }

  100% {
    opacity: 1;
    transform: translate(0, 0) scale(1) rotate(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .line-traffic-icon--entering :deep(.line-icon-badge),
  .line-traffic-icon--report-arriving .line-traffic-icon__frame,
  .line-traffic-icon--report-arriving .line-traffic-icon__frame rect,
  .line-traffic-icon--report-arriving .line-traffic-icon__status {
    animation: none;
    transition: none;
  }
}
</style>
