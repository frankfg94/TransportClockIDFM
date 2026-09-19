<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import type { NearbyCityComparisonScale } from "./nearbyCityComparison";

const props = defineProps<{
  scale: NearbyCityComparisonScale;
  currentName: string;
  targetName: string;
  /** When false, only the current city is shown: one value, no rail. */
  showTarget?: boolean;
  /** Format helper for the value shown under each dot. */
  title?: string;
}>();

const { t } = useI18n();
const showTarget = computed(() => props.showTarget !== false);

// Both markers stay inside the track so a dot is never clipped at either end.
const INSET_PERCENT = 3;
const trackPosition = (position: number): string =>
  `${INSET_PERCENT + position * (100 - INSET_PERCENT * 2)}%`;

const currentStyle = computed(() => ({ left: trackPosition(props.scale.current.position) }));
const targetStyle = computed(() => ({ left: trackPosition(props.scale.target.position) }));
const bridgeStyle = computed(() => {
  const from = Math.min(props.scale.current.position, props.scale.target.position);
  const to = Math.max(props.scale.current.position, props.scale.target.position);
  const start = INSET_PERCENT + from * (100 - INSET_PERCENT * 2);
  return {
    left: `${start}%`,
    width: `${Math.max(0, (to - from) * (100 - INSET_PERCENT * 2))}%`,
  };
});
const hasBridge = computed(() =>
  showTarget.value
  && !props.scale.current.missing
  && !props.scale.target.missing
  && props.scale.current.position !== props.scale.target.position);

const missingLabel = computed(() => t("nearbyStations.cityComparison.missingValue"));
const visualLabel = computed(() => (showTarget.value
  ? t("nearbyStations.cityComparison.visualAria", {
      current: props.currentName,
      currentValue: props.scale.current.text,
      target: props.targetName,
      targetValue: props.scale.target.text,
    })
  : t("nearbyStations.cityComparison.singleVisualAria", {
      current: props.currentName,
      currentValue: props.scale.current.text,
    })));
</script>

<template>
  <div
    class="comparison-dumbbell"
    :class="{ 'comparison-dumbbell--single': !showTarget }"
    :title="title"
    :aria-label="visualLabel"
  >
    <div class="comparison-dumbbell__track" aria-hidden="true">
      <span v-if="hasBridge" class="comparison-dumbbell__bridge" :style="bridgeStyle" />
      <span
        v-if="!scale.current.missing"
        class="comparison-dumbbell__dot comparison-dumbbell__dot--current"
        :class="{ 'comparison-dumbbell__dot--loading': scale.current.loading }"
        :style="currentStyle"
      />
      <span
        v-if="showTarget && !scale.target.missing"
        class="comparison-dumbbell__dot comparison-dumbbell__dot--target"
        :class="{ 'comparison-dumbbell__dot--loading': scale.target.loading }"
        :style="targetStyle"
      />
    </div>
    <div class="comparison-dumbbell__values">
      <span
        class="comparison-dumbbell__value comparison-dumbbell__value--current"
        :class="{ 'comparison-dumbbell__value--missing': scale.current.missing }"
      >{{ scale.current.missing ? missingLabel : scale.current.text }}</span>
      <span
        v-if="showTarget"
        class="comparison-dumbbell__value comparison-dumbbell__value--target"
        :class="{ 'comparison-dumbbell__value--missing': scale.target.missing }"
      >{{ scale.target.missing ? missingLabel : scale.target.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.comparison-dumbbell {
  display: grid;
  gap: 3px;
  min-width: 0;
  width: 100%;
}

/* Single city: the value sits under its dot instead of being right aligned. */
.comparison-dumbbell--single .comparison-dumbbell__values { justify-content: flex-start; }

.comparison-dumbbell__track {
  background: #eef1f5;
  border-radius: 999px;
  height: 5px;
  position: relative;
}

.comparison-dumbbell__bridge {
  background: linear-gradient(90deg, rgba(81, 70, 255, .5), rgba(12, 124, 138, .5));
  border-radius: 999px;
  height: 5px;
  position: absolute;
  top: 0;
}

.comparison-dumbbell__dot {
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .3);
  height: 15px;
  margin-left: -7.5px;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  transition: left 320ms cubic-bezier(.2, .8, .2, 1);
  width: 15px;
}

.comparison-dumbbell__dot--current { background: #5146ff; }
/* Slightly blue teal: it must never read as the green "better" status. */
.comparison-dumbbell__dot--target {
  background: #0c7c8a;
  z-index: 1;
}

.comparison-dumbbell__dot--loading {
  animation: comparison-dumbbell-pulse 900ms ease-in-out infinite;
}

.comparison-dumbbell__values {
  display: flex;
  font-size: .75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 850;
  justify-content: space-between;
  line-height: 1.1;
}

.comparison-dumbbell__value--current { color: #3f35d6; }
.comparison-dumbbell__value--target { color: #0c7c8a; }

.comparison-dumbbell__value--missing {
  color: #94a3b8;
  font-weight: 750;
}

@keyframes comparison-dumbbell-pulse {
  50% { opacity: .35; }
}

@media (prefers-reduced-motion: reduce) {
  .comparison-dumbbell__dot { transition: none; }
  .comparison-dumbbell__dot--loading { animation: none; }
}
</style>
