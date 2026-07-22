<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { BusFront, CalendarDays, Clock3, MoonStar, X } from "lucide-vue-next";
import { useI18n } from "../i18n";
import type { TrafficAlertModalData } from "../features/traffic";
import {
  classifyPatternTrafficIncident,
  getPatternTrafficSummaryCopy,
} from "../features/service-pattern/trafficCalendarSummary";
import PatternTrafficIncidentSummaryItem from "../features/service-pattern/PatternTrafficIncidentSummaryItem.vue";
import {
  extractTrafficModalDateTiles,
  type TrafficModalClockTime,
  type TrafficModalDateTile,
  type TrafficModalTimeWindow,
} from "../features/traffic/trafficModalFormatting";

const props = withDefaults(
  defineProps<{
    open: boolean;
    alert?: TrafficAlertModalData;
    smartFormattingEnabled?: boolean;
    showGoToTraficPage?: boolean;
  }>(),
  {
    alert: undefined,
    smartFormattingEnabled: true,
    showGoToTraficPage: false,
  },
);

const emit = defineEmits<{
  close: [];
  "go-to-traffic-page": [];
}>();

const { d, t } = useI18n();
const dialog = ref<HTMLElement>();
const activeTrafficModalDisruptionIndex = ref(0);
let previousFocus: HTMLElement | undefined;

const trafficModalDisruptions = computed(() => {
  const alert = props.alert;
  if (!alert) return [];
  if (alert.disruptions?.length) return alert.disruptions;

  return alert.disruption ? [alert.disruption] : [];
});

const activeTrafficModalDisruption = computed(
  () =>
    trafficModalDisruptions.value[activeTrafficModalDisruptionIndex.value] ??
    trafficModalDisruptions.value[0],
);

const hasMultipleTrafficModalDisruptions = computed(
  () => trafficModalDisruptions.value.length > 1,
);

const trafficModalSummary = computed(() => {
  const disruption = activeTrafficModalDisruption.value;
  return disruption ? getPatternTrafficSummaryCopy(disruption) : {};
});

const trafficModalTitle = computed(() => {
  const alert = props.alert;
  if (!alert) return "";

  return trafficModalSummary.value.title || alert.title || alert.label;
});

const trafficModalIncidentType = computed(() => {
  const alert = props.alert;
  const disruption = activeTrafficModalDisruption.value;
  if (!disruption) {
    return alert?.tone === "red" ? "interruption" : "incident";
  }

  return classifyPatternTrafficIncident(disruption);
});

const trafficModalDateTiles = computed(() => {
  const disruption = activeTrafficModalDisruption.value;
  if (!props.smartFormattingEnabled || !disruption) return [];

  return extractTrafficModalDateTiles(disruption, trafficModalSummary.value.title);
});

const trafficModalMessage = computed(() => {
  const alert = props.alert;
  const disruption = activeTrafficModalDisruption.value;
  if (!disruption) return alert?.message || "";

  return getDistinctTrafficModalLines([
    disruption.title,
    trafficModalSummary.value.description,
    disruption.message,
    alert?.message,
  ]).join("\n");
});

function getDistinctTrafficModalLines(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) =>
    (value ?? "")
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;

        const key = line
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/gu, "")
          .toLocaleLowerCase("fr")
          .replace(/\s+/gu, " ")
          .replace(/[.!?;:]+$/gu, "");
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      }),
  );
}

function formatTrafficModalDate(date: Date, includeYear = false): string {
  return d(date, {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

function isCrossYearTrafficModalDateRange(tile: TrafficModalDateTile): boolean {
  return Boolean(tile.start && tile.end && tile.start.getFullYear() !== tile.end.getFullYear());
}

function formatTrafficModalIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function isSameTrafficModalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTrafficModalClock(clock: TrafficModalClockTime): string {
  return String(clock.hour).padStart(2, "0") + ":" + String(clock.minute).padStart(2, "0");
}

function formatTrafficModalTimeWindow(window: TrafficModalTimeWindow): string {
  const start = formatTrafficModalClock(window.start);
  if (window.end) {
    return t("app.trafficModalTimeRange", {
      start,
      end: formatTrafficModalClock(window.end),
    });
  }
  if (window.untilEndOfService) {
    return t("app.trafficModalUntilEndOfService", { start });
  }

  return t("app.trafficModalFromTime", { time: start });
}

function focusDialog(): void {
  void nextTick(() => dialog.value?.focus());
}

function restorePreviousFocus(): void {
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }

  previousFocus = undefined;
}

function openModal(): void {
  previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  focusDialog();
}

function closeModal(): void {
  emit("close");
}

function selectTrafficModalDisruption(index: number): void {
  if (index < 0 || index >= trafficModalDisruptions.value.length) return;

  activeTrafficModalDisruptionIndex.value = index;
}

watch(
  () => [
    props.open,
    trafficModalDisruptions.value.map((disruption) => disruption.id).join("|"),
    props.alert?.label,
  ] as const,
  ([open]) => {
    activeTrafficModalDisruptionIndex.value = 0;
    if (open) {
      openModal();
    } else {
      restorePreviousFocus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  restorePreviousFocus();
});
</script>

<template>
  <Transition name="traffic-alert-modal">
    <div
      v-if="open && alert"
      class="modal-backdrop traffic-alert-modal-backdrop fullscreen-station-panel__traffic-modal-backdrop"
      @click.self="closeModal"
      @pointerdown.stop
    >
      <article
        ref="dialog"
        class="traffic-alert-modal fullscreen-station-panel__traffic-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="trafficModalTitle"
        tabindex="-1"
        @keydown.esc.prevent.stop="closeModal"
      >
        <header class="traffic-alert-modal__header fullscreen-station-panel__traffic-modal-header">
          <button
            class="traffic-alert-modal__close fullscreen-station-panel__traffic-modal-close"
            type="button"
            :aria-label="t('app.closeTrafficModalAria')"
            @click="closeModal"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="traffic-alert-modal__body fullscreen-station-panel__traffic-modal-body">
          <ul class="traffic-alert-modal__summary fullscreen-station-panel__traffic-modal-summary">
            <PatternTrafficIncidentSummaryItem
              :critical="alert.tone === 'red'"
              :incident-type="trafficModalIncidentType"
              :title="trafficModalTitle"
            />
          </ul>
          <ul v-if="trafficModalDateTiles.length" class="traffic-alert-modal__date-tiles">
            <li
              v-for="tile in trafficModalDateTiles"
              :key="tile.id"
              class="traffic-alert-modal__date-tile"
              :class="{
                'traffic-alert-modal__date-tile--replacement-bus': tile.replacementBus,
              }"
            >
              <span class="traffic-alert-modal__date-tile-icon">
                <BusFront v-if="tile.replacementBus" aria-hidden="true" />
                <CalendarDays v-else aria-hidden="true" />
              </span>
              <div class="traffic-alert-modal__date-tile-copy">
                <strong>{{ tile.title }}</strong>
                <span v-if="tile.replacementBus">
                  {{ t("app.trafficModalReplacementBus") }}
                </span>
                <span v-if="tile.evening" class="traffic-alert-modal__date-tile-evening">
                  <MoonStar aria-hidden="true" />
                  {{ t("app.trafficModalEvening") }}
                </span>
                <span v-if="tile.timeWindows.length" class="traffic-alert-modal__date-tile-times">
                  <Clock3 aria-hidden="true" />
                  <span v-for="(window, index) in tile.timeWindows" :key="index">
                    {{ formatTrafficModalTimeWindow(window) }}
                  </span>
                </span>
              </div>
              <div
                v-if="tile.start || tile.end || tile.endLabel"
                class="traffic-alert-modal__date-tile-period"
              >
                <template v-if="tile.start && tile.end">
                  <time :datetime="formatTrafficModalIsoDate(tile.start)">
                    {{ formatTrafficModalDate(tile.start, isCrossYearTrafficModalDateRange(tile)) }}
                  </time>
                  <template v-if="!isSameTrafficModalDate(tile.start, tile.end)">
                    <span aria-hidden="true">→</span>
                    <time :datetime="formatTrafficModalIsoDate(tile.end)">
                      {{ formatTrafficModalDate(tile.end, isCrossYearTrafficModalDateRange(tile)) }}
                    </time>
                  </template>
                </template>
                <time v-else-if="tile.end" :datetime="formatTrafficModalIsoDate(tile.end)">
                  {{
                    t("app.trafficModalUntilDate", {
                      date: formatTrafficModalDate(tile.end),
                    })
                  }}
                </time>
                <span v-else-if="tile.endLabel">
                  {{
                    t("app.trafficModalUntilLabel", {
                      label: tile.endLabel,
                    })
                  }}
                </span>
              </div>
            </li>
          </ul>
          <p
            v-if="trafficModalMessage"
            class="traffic-alert-modal__detail fullscreen-station-panel__traffic-modal-detail"
          >
            {{ trafficModalMessage }}
          </p>
          <footer
            v-if="hasMultipleTrafficModalDisruptions || showGoToTraficPage"
            class="traffic-alert-modal__footer"
          >
            <nav
              v-if="hasMultipleTrafficModalDisruptions"
              class="traffic-alert-modal__stepper"
              :aria-label="t('app.trafficModalMultipleInterruptionsAria')"
            >
              <button
                v-for="(disruption, index) in trafficModalDisruptions"
                :key="disruption.id"
                class="traffic-alert-modal__stepper-dot"
                :class="{
                  'traffic-alert-modal__stepper-dot--active':
                    index === activeTrafficModalDisruptionIndex,
                }"
                type="button"
                :aria-current="index === activeTrafficModalDisruptionIndex ? 'step' : undefined"
                :aria-label="
                  t('app.trafficModalInterruptionStepAria', {
                    index: index + 1,
                    count: trafficModalDisruptions.length,
                  })
                "
                @click="selectTrafficModalDisruption(index)"
              />
            </nav>
            <div v-if="showGoToTraficPage" class="traffic-alert-modal__actions">
              <button
                class="traffic-alert-modal__go-to-traffic"
                type="button"
                @click="emit('go-to-traffic-page')"
              >
                {{ t("app.openTrafficPage") }}
              </button>
            </div>
          </footer>
        </div>
      </article>
    </div>
  </Transition>
</template>

<style scoped>
.traffic-alert-modal-backdrop {
  align-items: center;
  background: rgba(2, 6, 23, 0.74);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: clamp(16px, 4vw, 48px);
  position: fixed;
  z-index: 12020;
}

.traffic-alert-modal {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.42);
  color: #0f172a;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: min(72dvh, 640px);
  max-width: 660px;
  overflow: hidden;
  width: min(100%, 660px);
}

.traffic-alert-modal__header {
  display: flex;
  justify-content: flex-end;
  padding: 14px 16px 0;
}

.traffic-alert-modal__close {
  align-items: center;
  background: #f1f5f9;
  border: 0;
  border-radius: 999px;
  color: #0f172a;
  display: inline-flex;
  flex: 0 0 auto;
  height: 44px;
  justify-content: center;
  padding: 0;
  width: 44px;
}

.traffic-alert-modal__close svg {
  height: 22px;
  width: 22px;
}

.traffic-alert-modal__body {
  display: grid;
  gap: 22px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px clamp(20px, 4vw, 32px) clamp(20px, 4vw, 32px);
}

.traffic-alert-modal__summary {
  list-style: none;
  margin: 0;
  padding: 0;
}

.traffic-alert-modal__date-tiles {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.traffic-alert-modal__date-tile {
  align-items: center;
  background: linear-gradient(135deg, #f8faff, #ffffff);
  border: 1px solid #c7d2fe;
  border-radius: 16px;
  display: grid;
  gap: 14px;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  padding: 14px 16px;
}

.traffic-alert-modal__date-tile--replacement-bus {
  background: linear-gradient(135deg, #fff7ed, #ffffff);
  border-color: #fed7aa;
}

.traffic-alert-modal__date-tile-icon {
  align-items: center;
  background: #e0e7ff;
  border-radius: 12px;
  color: #3730a3;
  display: inline-flex;
  height: 42px;
  justify-content: center;
  width: 42px;
}

.traffic-alert-modal__date-tile--replacement-bus .traffic-alert-modal__date-tile-icon {
  background: #ffedd5;
  color: #ea580c;
}

.traffic-alert-modal__date-tile-icon svg {
  height: 25px;
  width: 25px;
}

.traffic-alert-modal__date-tile-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.traffic-alert-modal__date-tile-copy strong {
  color: #25213d;
  font-size: 0.98rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.traffic-alert-modal__date-tile-copy > span {
  color: #57516e;
  font-size: 0.86rem;
  line-height: 1.3;
}

.traffic-alert-modal__date-tile-evening {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.traffic-alert-modal__date-tile-evening svg {
  flex: 0 0 auto;
  height: 15px;
  width: 15px;
}

.traffic-alert-modal__date-tile-times {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.traffic-alert-modal__date-tile-times svg {
  flex: 0 0 auto;
  height: 15px;
  width: 15px;
}

.traffic-alert-modal__date-tile-times > span + span::before {
  color: #a09aaf;
  content: "•";
  margin-right: 8px;
}

.traffic-alert-modal__date-tile-period {
  align-items: center;
  color: #17132e;
  display: flex;
  font-size: 1.05rem;
  font-weight: 850;
  gap: 8px;
  white-space: nowrap;
}

.traffic-alert-modal__detail {
  border-top: 1px solid #e2e8f0;
  color: #0f172a;
  font-size: clamp(1rem, 2.4vw, 1.2rem);
  line-height: 1.65;
  margin: 0;
  overflow-wrap: anywhere;
  padding-top: 20px;
  white-space: pre-line;
}

.traffic-alert-modal__footer {
  align-items: center;
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  padding-top: 20px;
}

.traffic-alert-modal__stepper {
  align-items: center;
  display: flex;
  gap: 2px;
  grid-column: 2;
  justify-content: center;
}

.traffic-alert-modal__stepper-dot {
  align-items: center;
  background: transparent;
  border: 0;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 18px;
}

.traffic-alert-modal__stepper-dot::before {
  background: #d1d5db;
  border-radius: 999px;
  content: "";
  height: 7px;
  transition:
    background-color 140ms ease,
    transform 140ms ease;
  width: 7px;
}

.traffic-alert-modal__stepper-dot:hover::before,
.traffic-alert-modal__stepper-dot:focus-visible::before {
  background: #a78bfa;
}

.traffic-alert-modal__stepper-dot:focus-visible {
  border-radius: 999px;
  outline: 2px solid rgba(124, 58, 237, 0.34);
  outline-offset: 0;
}

.traffic-alert-modal__stepper-dot--active::before {
  background: #6d4aff;
  transform: scale(1.12);
}

.traffic-alert-modal__actions {
  display: flex;
  grid-column: 3;
  justify-content: flex-end;
}

.traffic-alert-modal__go-to-traffic {
  background: #0f172a;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  font: inherit;
  font-weight: 800;
  min-height: 44px;
  padding: 10px 18px;
}

.traffic-alert-modal-enter-active,
.traffic-alert-modal-leave-active {
  transition: opacity 160ms ease;
}

.traffic-alert-modal-enter-from,
.traffic-alert-modal-leave-to {
  opacity: 0;
}

@media (max-width: 560px) {
  .traffic-alert-modal-backdrop {
    padding: 0;
  }

  .traffic-alert-modal {
    border-radius: 0;
    max-height: 100dvh;
    max-width: none;
    width: 100%;
  }

  .traffic-alert-modal__date-tile {
    align-items: start;
    grid-template-columns: 40px minmax(0, 1fr);
    padding: 13px;
  }

  .traffic-alert-modal__date-tile-icon {
    height: 38px;
    width: 38px;
  }

  .traffic-alert-modal__date-tile-period {
    font-size: 0.94rem;
    grid-column: 2;
    justify-self: start;
  }

  .traffic-alert-modal__footer {
    grid-template-columns: 1fr auto 1fr;
  }

  .traffic-alert-modal__go-to-traffic {
    font-size: 0.86rem;
    padding-inline: 14px;
  }
}
</style>
