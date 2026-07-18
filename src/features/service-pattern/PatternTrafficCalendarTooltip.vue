<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "../../i18n";
import type { PatternTrafficCalendarDay } from "./trafficCalendar";

const props = defineProps<{
  day: PatternTrafficCalendarDay;
  tooltipId: string;
  gridColumnStart?: number;
}>();

const trigger = ref<HTMLElement>();
const touchOpen = ref(false);
const hoverOpen = ref(false);
const focusOpen = ref(false);
const panelHovered = ref(false);
const tooltipPosition = ref({ left: 0, top: 0, above: true });
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const { n, t } = useI18n();
const hasDetails = computed(() => props.day.events.length > 0);
const isOpen = computed(
  () => hasDetails.value && (hoverOpen.value || touchOpen.value || focusOpen.value),
);
const tooltipStyle = computed(() => ({
  left: `${tooltipPosition.value.left}px`,
  top: `${tooltipPosition.value.top}px`,
  transform: tooltipPosition.value.above
    ? "translate(-50%, -100%)"
    : "translate(-50%, 0)",
}));
const severityLabel = computed(() =>
  props.day.severity
    ? t(`pattern.trafficCalendarSeverity.${props.day.severity.level}`)
    : t("pattern.trafficCalendarNoImpact"),
);
const durationLabel = computed(() => {
  const minutes = props.day.durationMinutes;
  if (minutes === undefined) return t("pattern.trafficCalendarDurationUnknown");
  if (minutes < 60) {
    return t("pattern.trafficCalendarDurationMinutes", {
      count: n(minutes),
    });
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? t("pattern.trafficCalendarDurationHoursMinutes", {
        hours: n(hours),
        minutes: n(remainingMinutes),
      })
    : t("pattern.trafficCalendarDurationHours", { count: n(hours) });
});

function updateTooltipPosition(): void {
  if (typeof window === "undefined" || !trigger.value) return;

  const rect = trigger.value.getBoundingClientRect();
  const horizontalInset = 16;
  const estimatedWidth = Math.min(320, window.innerWidth - horizontalInset * 2);
  tooltipPosition.value = {
    left: Math.min(
      Math.max(rect.left + rect.width / 2, horizontalInset + estimatedWidth / 2),
      window.innerWidth - horizontalInset - estimatedWidth / 2,
    ),
    top: rect.top < 260 ? rect.bottom + 8 : rect.top - 8,
    above: rect.top >= 260,
  };
}

function clearHoverTimer(): void {
  if (hoverTimer === undefined) return;
  clearTimeout(hoverTimer);
  hoverTimer = undefined;
}

function clearCloseTimer(): void {
  if (closeTimer === undefined) return;
  clearTimeout(closeTimer);
  closeTimer = undefined;
}

function scheduleHover(event: PointerEvent): void {
  if (event.pointerType === "touch" || !hasDetails.value || hoverOpen.value) {
    return;
  }

  clearCloseTimer();
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    hoverOpen.value = true;
    hoverTimer = undefined;
  }, 1_000);
}

function scheduleHoverClose(): void {
  clearHoverTimer();
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    if (!panelHovered.value) hoverOpen.value = false;
    closeTimer = undefined;
  }, 120);
}

function toggleTouch(event: PointerEvent): void {
  if (event.pointerType !== "touch" || !hasDetails.value) return;
  clearHoverTimer();
  hoverOpen.value = false;
  touchOpen.value = !touchOpen.value;
}

function openFromFocus(): void {
  if (hasDetails.value) focusOpen.value = true;
}

function closeFromFocus(): void {
  focusOpen.value = false;
}

function enterPanel(): void {
  panelHovered.value = true;
  clearCloseTimer();
}

function leavePanel(): void {
  panelHovered.value = false;
  hoverOpen.value = false;
}

function closeTooltip(): void {
  clearHoverTimer();
  clearCloseTimer();
  focusOpen.value = false;
  hoverOpen.value = false;
  touchOpen.value = false;
}

function repositionTooltip(): void {
  if (isOpen.value) updateTooltipPosition();
}

watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  updateTooltipPosition();
});

onMounted(() => {
  window.addEventListener("resize", repositionTooltip);
  window.addEventListener("scroll", repositionTooltip, true);
});

onBeforeUnmount(() => {
  clearHoverTimer();
  clearCloseTimer();
  window.removeEventListener("resize", repositionTooltip);
  window.removeEventListener("scroll", repositionTooltip, true);
});
</script>

<template>
  <div
    ref="trigger"
    class="pattern-traffic-calendar-tooltip"
    :style="{ gridColumnStart }"
    :data-tooltip-date="day.dateKey"
    @pointerenter="scheduleHover"
    @pointerleave="scheduleHoverClose"
    @pointerup="toggleTouch"
    @focusin="openFromFocus"
    @focusout="closeFromFocus"
    @keydown.esc="closeTooltip"
  >
    <slot />
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      :id="tooltipId"
      class="pattern-traffic-calendar-tooltip__panel"
      :style="tooltipStyle"
      role="tooltip"
      data-testid="pattern-traffic-calendar-tooltip"
      @pointerenter="enterPanel"
      @pointerleave="leavePanel"
      @keydown.esc="closeTooltip"
    >
      <header>
        <strong>{{ severityLabel }}</strong>
        <span v-if="day.severity">
          {{ t("pattern.trafficCalendarScore", { score: n(day.severity.score) }) }}
        </span>
      </header>

      <div class="pattern-traffic-calendar-tooltip__scroll">
        <section v-if="day.interruptedStationLabels.length > 0">
          <h4>{{ t("pattern.trafficCalendarInterruptedStations") }}</h4>
          <ul>
            <li
              v-for="station in day.interruptedStationLabels"
              :key="`interrupted:${station}`"
            >
              {{ station }}
            </li>
          </ul>
        </section>

        <section v-if="day.disturbedStationLabels.length > 0">
          <h4>{{ t("pattern.trafficCalendarDisturbedStations") }}</h4>
          <ul>
            <li
              v-for="station in day.disturbedStationLabels"
              :key="`disturbed:${station}`"
            >
              {{ station }}
            </li>
          </ul>
        </section>

        <section v-if="day.affectedSegmentLabels.length > 0">
          <h4>{{ t("pattern.trafficCalendarAffectedSegments") }}</h4>
          <ul>
            <li
              v-for="segment in day.affectedSegmentLabels"
              :key="`segment:${segment}`"
            >
              {{ segment }}
            </li>
          </ul>
        </section>
      </div>

      <footer>
        <span>{{ t("pattern.trafficCalendarTotalDuration") }}</span>
        <strong>{{ durationLabel }}</strong>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.pattern-traffic-calendar-tooltip {
  min-width: 0;
}

.pattern-traffic-calendar-tooltip__panel {
  background: #17132e;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.3);
  color: #ffffff;
  display: grid;
  gap: 10px;
  max-width: min(320px, calc(100vw - 32px));
  min-width: min(260px, calc(100vw - 32px));
  padding: 12px;
  position: fixed;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  z-index: 100100;
}

.pattern-traffic-calendar-tooltip__panel header,
.pattern-traffic-calendar-tooltip__panel footer {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.pattern-traffic-calendar-tooltip__panel header span {
  color: #ddd6fe;
  font-size: 0.72rem;
  font-weight: 800;
}

.pattern-traffic-calendar-tooltip__scroll {
  display: grid;
  gap: 10px;
  max-height: min(180px, calc(100vh - 120px));
  overflow: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  scrollbar-width: thin;
}

.pattern-traffic-calendar-tooltip__panel section {
  display: grid;
  gap: 4px;
}

.pattern-traffic-calendar-tooltip__panel h4 {
  color: #f9a8d4;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  margin: 0;
  text-transform: uppercase;
}

.pattern-traffic-calendar-tooltip__panel ul {
  display: grid;
  gap: 3px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.pattern-traffic-calendar-tooltip__panel li {
  font-size: 0.76rem;
  line-height: 1.25;
}

.pattern-traffic-calendar-tooltip__panel footer {
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 0.72rem;
  padding-top: 9px;
}

@media (prefers-reduced-motion: reduce) {
  .pattern-traffic-calendar-tooltip__panel {
    transition: none;
  }
}
</style>
