<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ChevronLeft, ChevronRight, Info } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import type { TrafficDisruption } from "../traffic/types";
import TrafficDisruptionCard from "../traffic/TrafficDisruptionCard.vue";
import PatternTrafficTimelineDotMeta from "./PatternTrafficTimelineDotMeta.vue";
import type { PatternTrafficTimelineSeverity } from "./trafficTimeline";

type MobileSheetStage = "peek" | "mid" | "full";

export interface PatternTrafficTimelineDisplayItem {
  active: boolean;
  dateLabel: string;
  durationLabel?: string;
  id: string;
  severity: PatternTrafficTimelineSeverity;
  stationCountLabel: string;
}

const props = withDefaults(
  defineProps<{
    hasNext?: boolean;
    hasPrevious?: boolean;
    items: PatternTrafficTimelineDisplayItem[];
    loadingItemId?: string;
    selectedDisruptions?: TrafficDisruption[];
    todayActive?: boolean;
  }>(),
  {
    hasNext: false,
    hasPrevious: false,
    loadingItemId: undefined,
    selectedDisruptions: () => [],
    todayActive: true,
  },
);

const emit = defineEmits<{
  next: [];
  previous: [];
  resetToday: [];
  select: [id: string];
}>();

const mobileStage = ref<MobileSheetStage>("mid");
const suppressHandleClick = ref(false);
const mobileDrag = reactive({
  active: false,
  currentY: 0,
  pointerId: -1,
  startY: 0,
});
const { t } = useI18n();
const selectedDisruptions = computed(() => props.selectedDisruptions);
const sheetStyle = computed(() => ({
  "--pattern-traffic-timeline-drag-offset": mobileDrag.active
    ? `${Math.max(-90, Math.min(220, mobileDrag.currentY - mobileDrag.startY))}px`
    : "0px",
}));

function toggleMobileStage(): void {
  if (suppressHandleClick.value) {
    suppressHandleClick.value = false;
    return;
  }

  mobileStage.value = mobileStage.value === "full" ? "mid" : "full";
}

function startMobileDrag(event: PointerEvent): void {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }

  mobileDrag.active = true;
  mobileDrag.pointerId = event.pointerId;
  mobileDrag.startY = event.clientY;
  mobileDrag.currentY = event.clientY;

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
}

function moveMobileDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.currentY = event.clientY;
}

function finishMobileDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.currentY = event.clientY;
  const deltaY = mobileDrag.currentY - mobileDrag.startY;
  mobileDrag.active = false;
  mobileDrag.pointerId = -1;

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  if (Math.abs(deltaY) < 60) {
    return;
  }

  suppressHandleClick.value = true;
  window.setTimeout(() => {
    suppressHandleClick.value = false;
  }, 120);

  if (deltaY < 0) {
    mobileStage.value = mobileStage.value === "peek" ? "mid" : "full";
    return;
  }

  if (mobileStage.value === "full") {
    mobileStage.value = "mid";
  } else if (mobileStage.value === "mid") {
    mobileStage.value = "peek";
  }
}

function cancelMobileDrag(event: PointerEvent): void {
  if (!mobileDrag.active || event.pointerId !== mobileDrag.pointerId) {
    return;
  }

  mobileDrag.active = false;
  mobileDrag.pointerId = -1;
}
</script>

<template>
  <section
    class="pattern-traffic-timeline"
    :class="[
      `pattern-traffic-timeline--mobile-${mobileStage}`,
      { 'pattern-traffic-timeline--mobile-dragging': mobileDrag.active },
    ]"
    :style="sheetStyle"
    data-testid="pattern-traffic-timeline"
  >
    <button
      class="pattern-traffic-timeline__drag-handle"
      type="button"
      :aria-label="t('pattern.trafficTimelineDragAria')"
      data-testid="pattern-traffic-timeline-drag-handle"
      @click="toggleMobileStage"
      @pointerdown="startMobileDrag"
      @pointermove="moveMobileDrag"
      @pointerup="finishMobileDrag"
      @pointercancel="cancelMobileDrag"
    >
      <span aria-hidden="true"></span>
    </button>

    <header class="pattern-traffic-timeline__header">
      <div>
        <strong>{{ t("pattern.trafficTimelineTitle") }}</strong>
        <Info aria-hidden="true" />
      </div>
      <button
        class="pattern-traffic-timeline__today"
        :class="{ 'pattern-traffic-timeline__today--active': todayActive }"
        type="button"
        @click="emit('resetToday')"
      >
        {{ t("pattern.trafficTimelineToday") }}
      </button>
    </header>

    <div class="pattern-traffic-timeline__body">
      <button
        class="pattern-traffic-timeline__nav"
        type="button"
        :disabled="!hasPrevious"
        @click="emit('previous')"
      >
        <ChevronLeft aria-hidden="true" />
        <span>{{ t("pattern.trafficTimelinePrevious") }}</span>
      </button>

      <div class="pattern-traffic-timeline__track" role="list">
        <button
          v-for="item in items"
          :key="item.id"
          class="pattern-traffic-timeline__item"
          :class="[
            `pattern-traffic-timeline__item--${item.severity}`,
            {
              'pattern-traffic-timeline__item--active': item.active,
              'pattern-traffic-timeline__item--loading': item.id === loadingItemId,
            },
          ]"
          type="button"
          role="listitem"
          :aria-pressed="item.active"
          :disabled="item.id === loadingItemId"
          @click="emit('select', item.id)"
        >
          <PatternTrafficTimelineDotMeta
            :active="item.active"
            :date-label="item.dateLabel"
            :duration-label="item.durationLabel"
            :severity="item.severity"
            :station-count-label="item.stationCountLabel"
          />
          <span
            v-if="item.id === loadingItemId"
            class="pattern-traffic-timeline__loader"
            aria-hidden="true"
          ></span>
          <span class="pattern-traffic-timeline__dot" aria-hidden="true"></span>
        </button>
      </div>

      <button
        class="pattern-traffic-timeline__nav pattern-traffic-timeline__nav--next"
        type="button"
        :disabled="!hasNext"
        @click="emit('next')"
      >
        <span>{{ t("pattern.trafficTimelineNext") }}</span>
        <ChevronRight aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="selectedDisruptions.length > 0"
      class="pattern-traffic-timeline__details"
    >
      <TrafficDisruptionCard
        v-for="disruption in selectedDisruptions"
        :key="disruption.id"
        :disruption="disruption"
        compact
        :show-header="false"
        :impacted-stop-limit="4"
      />
    </div>
  </section>
</template>

<style scoped>
.pattern-traffic-timeline {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98)),
    #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  bottom: 18px;
  box-shadow: 0 24px 70px rgba(16, 35, 63, 0.18);
  color: #25213f;
  display: grid;
  gap: 16px;
  left: 50%;
  max-width: min(1040px, calc(100% - 48px));
  padding: 18px 20px;
  position: absolute;
  transform: translateX(-50%);
  width: min(1040px, calc(100% - 48px));
  z-index: 35;
}

.pattern-traffic-timeline__drag-handle {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  cursor: grab;
  display: none;
  justify-content: center;
  padding: 10px 0 4px;
  touch-action: none;
}

.pattern-traffic-timeline__drag-handle span {
  background: rgba(100, 116, 139, 0.42);
  border-radius: 999px;
  display: block;
  height: 5px;
  width: 48px;
}

.pattern-traffic-timeline__header {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.pattern-traffic-timeline__header div {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.pattern-traffic-timeline__header strong {
  font-size: 1rem;
  font-weight: 950;
}

.pattern-traffic-timeline__header svg {
  color: #706c9b;
  height: 17px;
  width: 17px;
}

.pattern-traffic-timeline__today {
  align-items: center;
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.14);
  border-radius: 999px;
  color: #37345c;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 900;
  min-height: 32px;
  padding: 0 12px;
}

.pattern-traffic-timeline__today--active {
  background: #f5f3ff;
  border-color: rgba(124, 58, 237, 0.22);
  color: #5b21b6;
}

.pattern-traffic-timeline__body {
  align-items: end;
  display: grid;
  gap: 14px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.pattern-traffic-timeline__track {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-auto-columns: minmax(96px, 1fr);
  grid-auto-flow: column;
  min-width: 0;
  overflow-x: auto;
  padding: 4px 2px 0;
  position: relative;
}

.pattern-traffic-timeline__track::before {
  background: linear-gradient(90deg, transparent, rgba(37, 52, 104, 0.16), transparent);
  bottom: 11px;
  content: "";
  height: 2px;
  left: 42px;
  position: absolute;
  right: 42px;
}

.pattern-traffic-timeline__item {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 10px;
  justify-items: center;
  min-height: 96px;
  min-width: 96px;
  padding: 0;
  position: relative;
  z-index: 1;
}

.pattern-traffic-timeline__dot {
  background: #ffffff;
  border: 3px solid #f1a6af;
  border-radius: 999px;
  box-shadow: 0 0 0 5px rgba(241, 166, 175, 0.12);
  display: block;
  height: 18px;
  width: 18px;
}

.pattern-traffic-timeline__item--loading {
  cursor: wait;
}

.pattern-traffic-timeline__item--loading .pattern-traffic-timeline__dot {
  opacity: 0.34;
}

.pattern-traffic-timeline__loader {
  animation: pattern-traffic-timeline-spin 720ms linear infinite;
  border: 2px solid rgba(176, 0, 103, 0.18);
  border-radius: 999px;
  border-top-color: #b00067;
  bottom: -1px;
  display: block;
  height: 24px;
  position: absolute;
  width: 24px;
}

.pattern-traffic-timeline__item--medium .pattern-traffic-timeline__dot {
  border-color: #a855f7;
  box-shadow: 0 0 0 6px rgba(168, 85, 247, 0.13);
}

.pattern-traffic-timeline__item--high .pattern-traffic-timeline__dot {
  border-color: #e11d48;
  box-shadow: 0 0 0 7px rgba(225, 29, 72, 0.13);
}

.pattern-traffic-timeline__item--active .pattern-traffic-timeline__dot {
  background: #b00067;
  border-color: #ffffff;
  box-shadow:
    0 0 0 4px rgba(176, 0, 103, 0.18),
    0 0 0 16px rgba(176, 0, 103, 0.08);
  height: 22px;
  width: 22px;
}

.pattern-traffic-timeline__nav {
  align-items: center;
  background: transparent;
  border: 0;
  color: #37345c;
  cursor: pointer;
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 900;
  gap: 5px;
  min-height: 38px;
  padding: 0 4px;
}

.pattern-traffic-timeline__nav:disabled {
  cursor: default;
  opacity: 0.38;
}

.pattern-traffic-timeline__nav svg {
  height: 20px;
  width: 20px;
}

.pattern-traffic-timeline__details {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  max-height: 190px;
  overflow: auto;
}

.pattern-traffic-timeline__details :deep(.traffic-disruption) {
  border-radius: 8px;
  padding: 10px;
}

@keyframes pattern-traffic-timeline-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pattern-traffic-timeline__loader {
    animation: none;
  }
}

@media (max-width: 720px) {
  .pattern-traffic-timeline {
    border-radius: 24px 24px 0 0;
    bottom: auto;
    box-shadow: 0 -24px 70px rgba(15, 23, 42, 0.24);
    gap: 10px;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 52dvh;
    inset: auto 0 0;
    left: 0;
    max-height: calc(100dvh - 10px);
    max-width: none;
    min-height: 180px;
    overflow: hidden;
    padding: 0 16px 16px;
    position: fixed;
    transform: translateY(var(--pattern-traffic-timeline-drag-offset, 0px));
    transition:
      height 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 180ms ease;
    width: 100%;
    z-index: 9100;
  }

  .pattern-traffic-timeline--mobile-peek {
    height: 28dvh;
  }

  .pattern-traffic-timeline--mobile-mid {
    height: 52dvh;
  }

  .pattern-traffic-timeline--mobile-full {
    height: 92dvh;
  }

  .pattern-traffic-timeline--mobile-dragging {
    transition: none;
  }

  .pattern-traffic-timeline__drag-handle {
    display: flex;
  }

  .pattern-traffic-timeline__body {
    align-items: stretch;
    gap: 8px;
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .pattern-traffic-timeline__track {
    align-items: start;
    grid-auto-columns: minmax(104px, 42%);
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .pattern-traffic-timeline__nav {
    display: none;
  }

  .pattern-traffic-timeline__details {
    max-height: none;
    min-height: 0;
    overflow: auto;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>
