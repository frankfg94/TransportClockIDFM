<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Directive } from "vue";
import type { TransitMode } from "../types/transit";
import {
  Check,
  Bell,
  BellRing,
  EllipsisVertical,
  Maximize2,
  Minimize2,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-vue-next";
import ContextMenu from "./ContextMenu.vue";
import DirectionFilterModal from "./DirectionFilterModal.vue";
import UserFriendlyTrafficModal from "./UserFriendlyTrafficModal.vue";
import { useI18n } from "../i18n";
import type { FullscreenStationPanelDesign } from "../features/app-settings";
import type { TrafficAlertModalData } from "../features/traffic";

interface FullscreenPanelDeparture {
  id: string;
  waitLabel: string;
  departureTime?: string;
  mission?: string;
  platform?: string;
  destination?: string;
  meta?: string;
  statusLabel?: string;
}

interface FullscreenPanelDirection {
  id: string;
  platforms?: string[];
  label: string;
  subtitle?: string;
  serviceEnded?: boolean;
  departures: FullscreenPanelDeparture[];
}

interface FitTextOptions {
  min?: number;
  max?: number;
}

const props = withDefaults(
  defineProps<{
    stationName: string;
    city?: string;
    lineName: string;
    lineShortName: string;
    lineColor?: string;
    lineTextColor?: string;
    transportTypeLabel?: string;
    transportMode?: TransitMode;
    directions?: FullscreenPanelDirection[];
    hiddenDirectionIds?: string[];
    design?: FullscreenStationPanelDesign;
    darkTheme?: boolean;
    panamDirectionId?: string;
    trafficAlert?: TrafficAlertModalData;
    smartTrafficModalFormatting?: boolean;
    loading?: boolean;
    error?: string;
    updatedAtLabel?: string;
    browserFullscreenActive?: boolean;
    alarmDepartureIds?: string[];
    inert?: boolean;
  }>(),
  {
    city: "",
    lineColor: "#4d7c0f",
    lineTextColor: "#ffffff",
    transportTypeLabel: "transport",
    directions: () => [],
    hiddenDirectionIds: () => [],
    design: "all-directions",
    darkTheme: false,
    panamDirectionId: undefined,
    trafficAlert: undefined,
    smartTrafficModalFormatting: true,
    loading: false,
    error: "",
    updatedAtLabel: "",
    browserFullscreenActive: false,
    alarmDepartureIds: () => [],
    inert: false,
  },
);

const emit = defineEmits<{
  close: [];
  "update:hiddenDirectionIds": [ids: string[]];
  "change-design": [
    payload: {
      design: FullscreenStationPanelDesign;
      panamDirectionId?: string;
    },
  ];
  "change-theme": [darkTheme: boolean];
  refresh: [];
  "toggle-fullscreen": [];
  "schedule-alarm": [
    payload: { directionId: string; departureId: string },
  ];
}>();
const { t, d } = useI18n();

const denseDepartures = computed(() =>
  visibleDirections.value.flatMap((direction) =>
    direction.departures.map((departure) => ({ direction, departure })),
  ).sort((a, b) => denseDepartureOrder(a.departure) - denseDepartureOrder(b.departure)),
);

function denseDepartureOrder(departure: FullscreenPanelDeparture): number {
  if (isDockedWaitLabel(departure.waitLabel)) return 0;
  const timestamp = departure.departureTime ? Date.parse(departure.departureTime) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function denseDepartureTime(departure: FullscreenPanelDeparture): string {
  const timestamp = departure.departureTime ? Date.parse(departure.departureTime) : Number.NaN;
  return Number.isFinite(timestamp)
    ? d(new Date(timestamp), { hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
}

const directionFilterOpen = ref(false);
const visibleDirections = computed(() => props.directions.filter(direction => !props.hiddenDirectionIds.includes(direction.id)));
const controlsVisible = ref(true);
const menuOpen = ref(false);
const menuTrigger = ref<HTMLElement>();
const fitTextFrames = new WeakMap<HTMLElement, number>();
const trafficModalOpen = ref(false);
const fitTextObservers = new WeakMap<HTMLElement, ResizeObserver>();
let hideTimer: number | undefined;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";
let previousHtmlScrollbarGutter = "";

const panelClasses = computed(() => [
  `fullscreen-station-panel--${props.design}`,
  props.darkTheme
    ? "fullscreen-station-panel--dark"
    : "fullscreen-station-panel--light",
]);

const panelStyle = computed(() => ({
  "--panel-line-color": props.lineColor,
  "--panel-line-text": props.lineTextColor,
}));

const selectedDoubleStopDirection = computed(
  () =>
    props.directions.find(
      (direction) => direction.id === props.panamDirectionId,
    ) ??
    props.directions.find((direction) => direction.departures.length > 0) ??
    props.directions[0],
);

// Only an explicit direction platform set can establish a single fixed platform.
// Two upcoming departures on the same platform are not a station topology proof.
const showDoubleStopPlatforms = computed(() => {
  if (props.transportMode !== "rer" && props.transportMode !== "train") return false;
  const direction = selectedDoubleStopDirection.value;
  if (!direction) return false;
  const configured = direction.platforms?.map(value => value.trim()).filter(Boolean) ?? [];
  const observed = direction.departures.map(departure => departure.platform?.trim()).filter((value): value is string => Boolean(value));
  const distinct = new Set([...configured, ...observed].map(value => value.toLocaleUpperCase()));
  return configured.length === 0 || distinct.size > 1;
});
function doubleStopPlatform(index: number): string | undefined {
  return showDoubleStopPlatforms.value
    ? getDeparture(selectedDoubleStopDirection.value, index)?.platform?.trim() || undefined
    : undefined;
}

const hasDirections = computed(() => visibleDirections.value.length > 0);
const alarmDepartureIdSet = computed(
  () => new Set(props.alarmDepartureIds),
);

function scheduleFitText(
  element: HTMLElement,
  options?: FitTextOptions,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const pendingFrame = fitTextFrames.get(element);

  if (pendingFrame !== undefined) {
    window.cancelAnimationFrame(pendingFrame);
  }

  const frame = window.requestAnimationFrame(() => {
    fitTextFrames.delete(element);
    fitTextToAvailableWidth(element, options);
  });

  fitTextFrames.set(element, frame);
}

function fitTextToAvailableWidth(
  element: HTMLElement,
  options: FitTextOptions = {},
): void {
  const availableWidth = element.clientWidth;

  if (availableWidth <= 0 || !element.textContent?.trim()) {
    return;
  }

  element.style.fontSize = "";

  const computedStyle = window.getComputedStyle(element);
  const computedFontSize = Number.parseFloat(computedStyle.fontSize);
  const maxFontSize =
    options.max ?? (Number.isFinite(computedFontSize) ? computedFontSize : 16);
  const minFontSize = options.min ?? 12;

  element.style.fontSize = `${maxFontSize}px`;

  if (element.scrollWidth <= availableWidth + 1) {
    return;
  }

  let low = minFontSize;
  let high = maxFontSize;
  let best = minFontSize;

  for (let step = 0; step < 14; step += 1) {
    const middle = (low + high) / 2;
    element.style.fontSize = `${middle}px`;

    if (element.scrollWidth <= availableWidth + 1) {
      best = middle;
      low = middle;
    } else {
      high = middle;
    }
  }

  element.style.fontSize = `${Math.max(minFontSize, best).toFixed(1)}px`;
}

const vFitText: Directive<HTMLElement, FitTextOptions | undefined> = {
  mounted(element, binding) {
    scheduleFitText(element, binding.value);

    if (typeof ResizeObserver !== "undefined") {
      const resizeTarget = element.parentElement ?? element;
      const observer = new ResizeObserver(() => {
        scheduleFitText(element, binding.value);
      });
      observer.observe(resizeTarget);
      fitTextObservers.set(element, observer);
    }

    void document.fonts?.ready.then(() => {
      scheduleFitText(element, binding.value);
    });
  },
  updated(element, binding) {
    void nextTick(() => {
      scheduleFitText(element, binding.value);
    });
  },
  beforeUnmount(element) {
    const pendingFrame = fitTextFrames.get(element);

    if (pendingFrame !== undefined) {
      window.cancelAnimationFrame(pendingFrame);
      fitTextFrames.delete(element);
    }

    fitTextObservers.get(element)?.disconnect();
    fitTextObservers.delete(element);
  },
};

function getDeparture(
  direction: FullscreenPanelDirection | undefined,
  index: number,
): FullscreenPanelDeparture | undefined {
  return direction?.departures[index];
}

function hasAlarm(
  departure: FullscreenPanelDeparture | undefined,
): boolean {
  return Boolean(departure && alarmDepartureIdSet.value.has(departure.id));
}

function requestAlarm(
  direction: FullscreenPanelDirection | undefined,
  departure: FullscreenPanelDeparture | undefined,
): void {
  if (!direction || !departure) {
    return;
  }

  emit("schedule-alarm", {
    directionId: direction.id,
    departureId: departure.id,
  });
}

function getWaitLabel(
  direction: FullscreenPanelDirection | undefined,
  departure: FullscreenPanelDeparture | undefined,
): string {
  if (props.loading) {
    return "...";
  }

  if (direction?.serviceEnded) {
    return t("board.finished");
  }

  return departure?.waitLabel || "--";
}

function isDockedWaitLabel(label: string): boolean {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .trim() === "a quai"
  );
}

function getWaitLabelLines(
  direction: FullscreenPanelDirection | undefined,
  departure: FullscreenPanelDeparture | undefined,
): string[] {
  const label = getWaitLabel(direction, departure);

  return isDockedWaitLabel(label)
    ? t("board.docked").split(" ")
    : [label];
}

function isStackedWaitLabel(
  direction: FullscreenPanelDirection | undefined,
  departure: FullscreenPanelDeparture | undefined,
): boolean {
  return getWaitLabelLines(direction, departure).length > 1;
}

function getDestinationLabel(
  direction: FullscreenPanelDirection | undefined,
  departure: FullscreenPanelDeparture | undefined,
): string {
  return departure?.destination || direction?.label || "";
}

function revealControls(): void {
  controlsVisible.value = true;
  scheduleControlsHide();
}

function scheduleControlsHide(): void {
  clearControlsHideTimer();

  if (menuOpen.value || directionFilterOpen.value) {
    return;
  }

  hideTimer = window.setTimeout(() => {
    controlsVisible.value = false;
    hideTimer = undefined;
  }, 10_000);
}

function clearControlsHideTimer(): void {
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
}

function lockDocumentScroll(): void {
  previousHtmlOverflow = document.documentElement.style.overflow;
  previousBodyOverflow = document.body.style.overflow;
  previousHtmlScrollbarGutter = document.documentElement.style.scrollbarGutter;

  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.scrollbarGutter = "auto";
  document.body.style.overflow = "hidden";
}

function restoreDocumentScroll(): void {
  document.documentElement.style.overflow = previousHtmlOverflow;
  document.documentElement.style.scrollbarGutter = previousHtmlScrollbarGutter;
  document.body.style.overflow = previousBodyOverflow;
}

function toggleMenu(): void {
  controlsVisible.value = true;
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function selectAllDirectionsDesign(): void {
  emit("change-design", { design: "all-directions" });
  closeMenu();
}

function selectHomeCardDesign(): void {
  emit("change-design", { design: "home-card" });
  closeMenu();
}

function selectDoubleStopDesign(directionId: string): void {
  emit("change-design", {
    design: "double-stop",
    panamDirectionId: directionId,
  });
  closeMenu();
}

function openDirectionFilter(): void {
  closeMenu();
  directionFilterOpen.value = true;
  clearControlsHideTimer();
}
function closeDirectionFilter(): void {
  directionFilterOpen.value = false;
  scheduleControlsHide();
  void nextTick(() => menuTrigger.value?.focus());
}
function openDoubleStopDesign(): void {
  const directionId = selectedDoubleStopDirection.value?.id;
  if (directionId) selectDoubleStopDesign(directionId);
  openDirectionFilter();
}

function toggleDarkTheme(event: Event): void {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;

  emit("change-theme", checked);
  controlsVisible.value = true;
}

function openTrafficModal(): void {
  if (!props.trafficAlert) {
    return;
  }

  trafficModalOpen.value = true;
  clearControlsHideTimer();
}

function closeTrafficModal(): void {
  trafficModalOpen.value = false;
  scheduleControlsHide();
}

function handleKeydown(event: KeyboardEvent): void {
  revealControls();

  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();

  if (directionFilterOpen.value) {
    closeDirectionFilter();
    return;
  }

  if (trafficModalOpen.value) {
    closeTrafficModal();
    return;
  }

  if (menuOpen.value) {
    closeMenu();
    return;
  }

  emit("close");
}

watch(menuOpen, (open) => {
  if (open) {
    controlsVisible.value = true;
    clearControlsHideTimer();
  } else {
    scheduleControlsHide();
  }
});

watch(
  () => props.trafficAlert,
  (trafficAlert) => {
    if (!trafficAlert && trafficModalOpen.value) {
      closeTrafficModal();
    }
  },
);

onMounted(() => {
  lockDocumentScroll();
  scheduleControlsHide();
});

onBeforeUnmount(() => {
  clearControlsHideTimer();
  restoreDocumentScroll();
});
</script>

<template>
  <section
    class="fullscreen-station-panel"
    :class="panelClasses"
    :style="panelStyle"
    role="dialog"
    :inert="inert || undefined"
    aria-modal="true"
    aria-labelledby="fullscreen-station-panel-title"
    tabindex="-1"
    @focusin="revealControls"
    @keydown="handleKeydown"
    @pointerdown="revealControls"
    @pointermove="revealControls"
  >
    <div
      class="fullscreen-station-panel__controls"
      :class="{
        'fullscreen-station-panel__controls--hidden':
          !controlsVisible && !menuOpen,
      }"
      @pointerdown.stop
    >
      <button
        class="fullscreen-station-panel__icon-button"
        type="button"
        :aria-label="t('app.refreshPanelAria')"
        @click="emit('refresh')"
      >
        <RefreshCw aria-hidden="true" />
      </button>

      <div class="fullscreen-station-panel__menu-wrap">
        <button
          ref="menuTrigger"
          class="fullscreen-station-panel__icon-button"
          type="button"
          :aria-label="t('app.panelOptionsAria')"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
        >
          <EllipsisVertical aria-hidden="true" />
        </button>

        <ContextMenu
          v-model:open="menuOpen"
          :anchor="menuTrigger"
          class="fullscreen-station-panel__menu"
          close-on-outside-click
          :teleport="false"
          :z-index="12050"
        >
          <label class="fullscreen-station-panel__theme-toggle">
            <input
              type="checkbox"
              :checked="darkTheme"
              @change="toggleDarkTheme"
            />
            <span aria-hidden="true"></span>
            <strong>{{ t("settings.display.panelDarkTheme") }}</strong>
          </label>

          <button
            type="button"
            role="menuitem"
            @click="emit('toggle-fullscreen')"
          >
            <Minimize2
              v-if="browserFullscreenActive"
              :size="17"
              aria-hidden="true"
            />
            <Maximize2 v-else :size="17" aria-hidden="true" />
            {{
              browserFullscreenActive
                ? t("app.exitFullscreen")
                : t("app.enterFullscreen")
            }}
          </button>

          <button type="button" role="menuitem" @click="openDirectionFilter">
            <SlidersHorizontal :size="17" aria-hidden="true" />
            {{ t(design === 'double-stop' ? 'board.directionFilter.singleTitle' : 'board.filterDirections') }}
          </button>

          <div class="fullscreen-station-panel__menu-heading">
            {{ t("app.changeDesign") }}
          </div>

          <button
            type="button"
            role="menuitem"
            @click="selectAllDirectionsDesign"
          >
            <Check
              v-if="design === 'all-directions'"
              :size="17"
              aria-hidden="true"
            />
            <span v-else aria-hidden="true"></span>
            {{ t("settings.options.fullscreenPanel.allDirections") }}
          </button>

          <button type="button" role="menuitem" @click="openDoubleStopDesign">
            <Check v-if="design === 'double-stop'" :size="17" aria-hidden="true" />
            <span v-else aria-hidden="true"></span>
            {{ t('settings.options.fullscreenPanel.doubleStop') }}
            <small v-if="design === 'double-stop'"> · {{ selectedDoubleStopDirection?.label }}</small>
          </button>

          <button type="button" role="menuitem" @click="selectHomeCardDesign">
            <Check
              v-if="design === 'home-card'"
              :size="17"
              aria-hidden="true"
            />
            <span v-else aria-hidden="true"></span>
            {{ t("settings.options.fullscreenPanel.homeCard") }}
          </button>
          <button type="button" role="menuitem" @click="emit('change-design', { design: 'dense-list' }); closeMenu()">
            <Check v-if="design === 'dense-list'" :size="17" aria-hidden="true" />
            <span v-else aria-hidden="true"></span>
            {{ t("settings.options.fullscreenPanel.denseList") }}
          </button>
        </ContextMenu>
      </div>

      <button
        class="fullscreen-station-panel__icon-button"
        type="button"
        :aria-label="t('app.closePanelAria')"
        @click="emit('close')"
      >
        <X aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="design === 'all-directions'"
      class="fullscreen-station-panel__surface fullscreen-station-panel__surface--all"
    >
      <header class="fullscreen-station-panel__header">
        <div class="fullscreen-station-panel__logo">
          <slot name="line-logo">
            <span class="fullscreen-station-panel__line-fallback">
              {{ lineShortName }}
            </span>
          </slot>
        </div>
        <div class="fullscreen-station-panel__heading">
          <p>{{ lineName }}</p>
          <h1 id="fullscreen-station-panel-title" v-fit-text="{ min: 12 }">
            {{ stationName }}
          </h1>
          <span v-if="city">{{ city }}</span>
        </div>
        <button
          v-if="trafficAlert"
          class="fullscreen-station-panel__alert"
          :class="`fullscreen-station-panel__alert--${trafficAlert.tone}`"
          type="button"
          :aria-label="t('app.openTrafficDetailsAria')"
          @click="openTrafficModal"
        >
          {{ trafficAlert.label }}
        </button>
      </header>

      <div v-if="error" class="fullscreen-station-panel__notice">
        {{ error }}
      </div>
      <div
        v-else-if="loading && !directions.length"
        class="fullscreen-station-panel__notice"
      >
        {{ t("common.states.loading") }}
      </div>
      <p v-else-if="!hasDirections" class="fullscreen-station-panel__notice">{{ t("board.allDirectionsHidden") }}</p>
      <div v-else class="fullscreen-station-panel__all-grid">
        <section
          v-for="direction in visibleDirections"
          :key="direction.id"
          class="fullscreen-station-panel__direction"
        >
          <h2 v-fit-text="{ min: 15 }">{{ direction.label }}</h2>
          <p v-if="direction.subtitle">{{ direction.subtitle }}</p>
          <strong
            class="fullscreen-station-panel__giant-time"
            :class="{
              'fullscreen-station-panel__wait-label--stacked':
                isStackedWaitLabel(direction, getDeparture(direction, 0)),
            }"
            v-fit-text="{ min: 38 }"
          >
            <span
              v-for="line in getWaitLabelLines(
                direction,
                getDeparture(direction, 0),
              )"
              :key="line"
              class="fullscreen-station-panel__wait-label-line"
            >
              {{ line }}
            </span>
          </strong>
          <span
            class="fullscreen-station-panel__next-time"
            :class="{
              'fullscreen-station-panel__wait-label--stacked':
                isStackedWaitLabel(direction, getDeparture(direction, 1)),
            }"
            v-fit-text="{ min: 24 }"
          >
            <span
              v-for="line in getWaitLabelLines(
                direction,
                getDeparture(direction, 1),
              )"
              :key="line"
              class="fullscreen-station-panel__wait-label-line"
            >
              {{ line }}
            </span>
          </span>
          <small>
            {{ getDestinationLabel(direction, getDeparture(direction, 0)) }}
          </small>
          <div class="fullscreen-station-panel__alarm-actions fullscreen-station-panel__alarm-actions--all">
            <button
              v-for="(departure, departureIndex) in direction.departures.slice(0, 2)"
              :key="'alarm-' + departure.id"
              class="fullscreen-station-panel__alarm-button"
              :class="{
                'fullscreen-station-panel__alarm-button--active': hasAlarm(departure),
                'fullscreen-station-panel__alarm-button--hidden':
                  !controlsVisible && !menuOpen,
                'fullscreen-station-panel__alarm-button--secondary':
                  departureIndex === 1,
              }"
              type="button"
              :aria-label="
                hasAlarm(departure)
                  ? t('board.alarmSetAria')
                  : t('board.alarmScheduleAria')
              "
              @pointerdown.stop
              @click.stop="requestAlarm(direction, departure)"
            >
              <BellRing v-if="hasAlarm(departure)" aria-hidden="true" />
              <Bell v-else aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>

      <footer class="fullscreen-station-panel__footer">
        <span v-if="updatedAtLabel">{{ updatedAtLabel }}</span>
      </footer>
    </div>

    <div
      v-else-if="design === 'double-stop'"
      class="fullscreen-station-panel__surface fullscreen-station-panel__surface--double"
    >
      <header class="fullscreen-station-panel__panam-header">
        <div class="fullscreen-station-panel__logo">
          <slot name="line-logo">
            <span class="fullscreen-station-panel__line-fallback">
              {{ lineShortName }}
            </span>
          </slot>
        </div>
        <div class="fullscreen-station-panel__panam-title">
          <h1 id="fullscreen-station-panel-title" v-fit-text="{ min: 12 }">
            {{ stationName }}
          </h1>
          <span class="direction-label">
            {{ selectedDoubleStopDirection?.label ?? "Direction" }}
          </span>
        </div>
      </header>

      <main
        class="fullscreen-station-panel__panam-body"
        :class="{
          'fullscreen-station-panel__panam-body--with-side': trafficAlert,
        }"
      >
        <section class="fullscreen-station-panel__panam-times">
          <div>
            <span class="transport-cell-title-text first">
              1er {{ transportTypeLabel }}
            </span>
            <strong
              :class="{
                'fullscreen-station-panel__wait-label--stacked':
                  isStackedWaitLabel(
                    selectedDoubleStopDirection,
                    getDeparture(selectedDoubleStopDirection, 0),
                  ),
              }"
              v-fit-text="{ min: 34 }"
            >
              <span
                v-for="line in getWaitLabelLines(
                  selectedDoubleStopDirection,
                  getDeparture(selectedDoubleStopDirection, 0),
                )"
                :key="line"
                class="fullscreen-station-panel__wait-label-line"
              >
                {{ line }}
              </span>
            </strong>
            <span v-if="doubleStopPlatform(0)" class="fullscreen-station-panel__panam-platform">
              {{ t('app.platform', { platform: doubleStopPlatform(0)! }) }}
            </span>
            <button
              v-if="getDeparture(selectedDoubleStopDirection, 0)"
              class="fullscreen-station-panel__alarm-button fullscreen-station-panel__alarm-button--cell"
              :class="{
                'fullscreen-station-panel__alarm-button--active':
                  hasAlarm(getDeparture(selectedDoubleStopDirection, 0)),
                'fullscreen-station-panel__alarm-button--hidden':
                  !controlsVisible && !menuOpen,
              }"
              type="button"
              :aria-label="
                hasAlarm(getDeparture(selectedDoubleStopDirection, 0))
                  ? t('board.alarmSetAria')
                  : t('board.alarmScheduleAria')
              "
              @pointerdown.stop
              @click.stop="requestAlarm(selectedDoubleStopDirection, getDeparture(selectedDoubleStopDirection, 0))"
            >
              <BellRing v-if="hasAlarm(getDeparture(selectedDoubleStopDirection, 0))" aria-hidden="true" />
              <Bell v-else aria-hidden="true" />
            </button>
          </div>
          <div>
            <span class="transport-cell-title-text second">
              2e {{ transportTypeLabel }}
            </span>
            <strong
              :class="{
                'fullscreen-station-panel__wait-label--stacked':
                  isStackedWaitLabel(
                    selectedDoubleStopDirection,
                    getDeparture(selectedDoubleStopDirection, 1),
                  ),
              }"
              v-fit-text="{ min: 34 }"
            >
              <span
                v-for="line in getWaitLabelLines(
                  selectedDoubleStopDirection,
                  getDeparture(selectedDoubleStopDirection, 1),
                )"
                :key="line"
                class="fullscreen-station-panel__wait-label-line"
              >
                {{ line }}
              </span>
            </strong>
            <span v-if="doubleStopPlatform(1)" class="fullscreen-station-panel__panam-platform">
              {{ t('app.platform', { platform: doubleStopPlatform(1)! }) }}
            </span>
            <button
              v-if="getDeparture(selectedDoubleStopDirection, 1)"
              class="fullscreen-station-panel__alarm-button fullscreen-station-panel__alarm-button--cell"
              :class="{
                'fullscreen-station-panel__alarm-button--active':
                  hasAlarm(getDeparture(selectedDoubleStopDirection, 1)),
                'fullscreen-station-panel__alarm-button--hidden':
                  !controlsVisible && !menuOpen,
              }"
              type="button"
              :aria-label="
                hasAlarm(getDeparture(selectedDoubleStopDirection, 1))
                  ? t('board.alarmSetAria')
                  : t('board.alarmScheduleAria')
              "
              @pointerdown.stop
              @click.stop="requestAlarm(selectedDoubleStopDirection, getDeparture(selectedDoubleStopDirection, 1))"
            >
              <BellRing v-if="hasAlarm(getDeparture(selectedDoubleStopDirection, 1))" aria-hidden="true" />
              <Bell v-else aria-hidden="true" />
            </button>
          </div>
        </section>

        <aside
          v-if="trafficAlert"
          class="fullscreen-station-panel__panam-side"
          role="button"
          tabindex="0"
          :aria-label="t('app.openTrafficDetailsAria')"
          @click="openTrafficModal"
          @keydown.enter.prevent="openTrafficModal"
          @keydown.space.prevent="openTrafficModal"
        >
          <strong>{{ selectedDoubleStopDirection?.label ?? "Direction" }}</strong>
          <span v-if="selectedDoubleStopDirection?.subtitle">
            {{ selectedDoubleStopDirection.subtitle }}
          </span>
          <p>{{ trafficAlert.label }}</p>
          <small v-if="updatedAtLabel">{{ updatedAtLabel }}</small>
        </aside>
      </main>
    </div>

    <div
      v-else-if="design === 'dense-list'"
      class="fullscreen-station-panel__surface fullscreen-station-panel__dense"
    >
      <header class="fullscreen-station-panel__dense-header">
        <div class="fullscreen-station-panel__logo">
          <slot name="line-logo"
            ><span class="fullscreen-station-panel__line-fallback">{{
              lineShortName
            }}</span></slot
          >
        </div>
        <div class="fullscreen-station-panel__dense-heading">
          <p>
            {{ lineName }} <span v-if="city">· {{ city }}</span>
          </p>
          <h1 id="fullscreen-station-panel-title">{{ stationName }}</h1>
        </div>
      </header>
      <button
        v-if="trafficAlert"
        class="fullscreen-station-panel__dense-traffic"
        type="button"
        :aria-label="t('app.openTrafficDetailsAria')"
        @click="openTrafficModal"
      >
        {{ trafficAlert.label }}
      </button>
      <p v-if="error" class="fullscreen-station-panel__notice" role="alert">
        {{ error }}
      </p>
      <p
        v-else-if="loading && !denseDepartures.length"
        class="fullscreen-station-panel__notice"
        role="status"
      >
        {{ t("board.loadingDepartures") }}
      </p>
      <ol
        v-else-if="denseDepartures.length"
        class="fullscreen-station-panel__dense-list"
        :aria-label="t('board.nextDeparturesAria')"
      >
        <li
          v-for="{ direction, departure } in denseDepartures"
          :key="direction.id + '-' + departure.id"
          class="fullscreen-station-panel__dense-row"
        >
          <div class="fullscreen-station-panel__dense-mission">
            <strong>{{ departure.mission || lineShortName }}</strong
            ><time :datetime="departure.departureTime">{{
              denseDepartureTime(departure)
            }}</time>
          </div>
          <div class="fullscreen-station-panel__dense-destination">
            <strong>{{ departure.destination || direction.label }}</strong>
            <div class="fullscreen-station-panel__dense-details">
              <small v-if="departure.meta || direction.subtitle">{{
                departure.meta || direction.subtitle
              }}</small>
              <small v-if="departure.statusLabel">{{
                departure.statusLabel
              }}</small>
            </div>
          </div>
          <span
            v-if="departure.platform"
            class="fullscreen-station-panel__dense-platform"
            >{{ t("app.platform", { platform: departure.platform }) }}</span
          >
          <div class="fullscreen-station-panel__dense-wait">
            <strong>{{
              getWaitLabelLines(direction, departure).join(" ")
            }}</strong>
            <small v-if="/^\d+$/.test(getWaitLabel(direction, departure))">{{
              t("settings.device.minutesUnit")
            }}</small>
          </div>
          <button
            class="fullscreen-station-panel__alarm-button"
            :class="{
              'fullscreen-station-panel__alarm-button--active':
                hasAlarm(departure),
              'fullscreen-station-panel__alarm-button--hidden':
                !controlsVisible && !menuOpen,
            }"
            type="button"
            :aria-label="
              hasAlarm(departure)
                ? t('board.alarmSetAria')
                : t('board.alarmScheduleAria')
            "
            @pointerdown.stop
            @click.stop="requestAlarm(direction, departure)"
          >
            <BellRing v-if="hasAlarm(departure)" aria-hidden="true" /><Bell
              v-else
              aria-hidden="true"
            />
          </button>
        </li>
      </ol>
      <div v-else class="fullscreen-station-panel__notice">
        <p v-if="!hasDirections">{{ t("board.allDirectionsHidden") }}</p>
        <p v-for="direction in visibleDirections" :key="direction.id">
          {{ direction.label }} ·
          {{
            direction.serviceEnded
              ? t("board.serviceEnded")
              : t("board.noUpcoming")
          }}
        </p>
      </div>
      <footer class="fullscreen-station-panel__dense-footer">
        <span>{{ t("board.departures", { count: denseDepartures.length }) }}</span
        ><span v-if="updatedAtLabel">{{ updatedAtLabel }}</span>
      </footer>
    </div>

    <div
      v-else
      class="fullscreen-station-panel__surface fullscreen-station-panel__surface--home"
    >
      <article class="fullscreen-station-panel__home-card">
        <header>
          <div class="fullscreen-station-panel__logo">
            <slot name="line-logo">
              <span class="fullscreen-station-panel__line-fallback">
                {{ lineShortName }}
              </span>
            </slot>
          </div>
          <div class="fullscreen-station-panel__heading">
            <p>{{ lineName }}</p>
            <h1 id="fullscreen-station-panel-title" v-fit-text="{ min: 12 }">
              {{ stationName }}
            </h1>
            <span v-if="city">{{ city }}</span>
          </div>
          <button
            v-if="trafficAlert"
            class="fullscreen-station-panel__alert"
            :class="`fullscreen-station-panel__alert--${trafficAlert.tone}`"
            type="button"
            :aria-label="t('app.openTrafficDetailsAria')"
            @click="openTrafficModal"
          >
            {{ trafficAlert.label }}
          </button>
        </header>

        <div v-if="error" class="fullscreen-station-panel__notice">
          {{ error }}
        </div>
        <p v-else-if="!hasDirections" class="fullscreen-station-panel__notice">{{ t("board.allDirectionsHidden") }}</p>
        <div v-else class="fullscreen-station-panel__home-directions">
          <section
            v-for="direction in visibleDirections"
            :key="direction.id"
            class="fullscreen-station-panel__home-direction"
          >
            <div>
              <p>DIRECTION</p>
              <strong v-fit-text="{ min: 16 }">{{ direction.label }}</strong>
            </div>
            <div class="fullscreen-station-panel__home-times">
              <span
                :class="{
                  'fullscreen-station-panel__wait-label--stacked':
                    isStackedWaitLabel(direction, getDeparture(direction, 0)),
                }"
                v-fit-text="{ min: 28 }"
              >
                <span
                  v-for="line in getWaitLabelLines(
                    direction,
                    getDeparture(direction, 0),
                  )"
                  :key="line"
                  class="fullscreen-station-panel__wait-label-line"
                >
                  {{ line }}
                </span>
              </span>
              <span
                :class="{
                  'fullscreen-station-panel__wait-label--stacked':
                    isStackedWaitLabel(direction, getDeparture(direction, 1)),
                }"
                v-fit-text="{ min: 28 }"
              >
                <span
                  v-for="line in getWaitLabelLines(
                    direction,
                    getDeparture(direction, 1),
                  )"
                  :key="line"
                  class="fullscreen-station-panel__wait-label-line"
                >
                  {{ line }}
                </span>
              </span>
              <div class="fullscreen-station-panel__alarm-actions fullscreen-station-panel__alarm-actions--home">
                <button
                  v-for="(departure, departureIndex) in direction.departures.slice(0, 2)"
                  :key="'home-alarm-' + departure.id"
                  class="fullscreen-station-panel__alarm-button"
                  :class="{
                    'fullscreen-station-panel__alarm-button--active': hasAlarm(departure),
                    'fullscreen-station-panel__alarm-button--hidden':
                      !controlsVisible && !menuOpen,
                    'fullscreen-station-panel__alarm-button--secondary':
                      departureIndex === 1,
                  }"
                  type="button"
                  :aria-label="
                    hasAlarm(departure)
                      ? t('board.alarmSetAria')
                      : t('board.alarmScheduleAria')
                  "
                  @pointerdown.stop
                  @click.stop="requestAlarm(direction, departure)"
                >
                  <BellRing v-if="hasAlarm(departure)" aria-hidden="true" />
                  <Bell v-else aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer>
          <span
            >{{ visibleDirections.length }} direction{{
              visibleDirections.length > 1 ? "s" : ""
            }}</span
          >
          <span v-if="updatedAtLabel">{{ updatedAtLabel }}</span>
        </footer>
      </article>
    </div>

    <DirectionFilterModal
      :open="directionFilterOpen"
      :directions="directions"
      :hidden-direction-ids="hiddenDirectionIds"
      :single="design === 'double-stop'"
      :selected-direction-id="selectedDoubleStopDirection?.id"
      :station-name="stationName"
      :line-name="lineName"
      :line-color="lineColor"
      :dark-theme="darkTheme"
      @update:hidden-direction-ids="emit('update:hiddenDirectionIds', $event)"
      @select-direction="selectDoubleStopDesign"
      @close="closeDirectionFilter"
    />

    <UserFriendlyTrafficModal
      :open="trafficModalOpen"
      :alert="trafficAlert"
      :smart-formatting-enabled="smartTrafficModalFormatting"
      @close="closeTrafficModal"
    />
  </section>
</template>

<style scoped>
.fullscreen-station-panel {
  --panel-line-color: #4d7c0f;
  --panel-line-text: #ffffff;
  background: #050505;
  color: #0b2440;
  display: grid;
  font-family: var(--font-sans);
  inset: 0;
  min-height: 100dvh;
  overflow: auto;
  overscroll-behavior: contain;
  position: fixed;
  z-index: 12000;
}

.fullscreen-station-panel__surface {
  min-height: 100dvh;
  overflow: hidden;
}

.fullscreen-station-panel__controls {
  align-items: flex-start;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 22px;
  pointer-events: auto;
  position: fixed;
  right: 0;
  top: 0;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  z-index: 3;
}

.fullscreen-station-panel__controls--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
}

.fullscreen-station-panel__direction,
.fullscreen-station-panel__panam-times > div,
.fullscreen-station-panel__home-times {
  position: relative;
}

.fullscreen-station-panel__alarm-actions {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 2;
}

.fullscreen-station-panel__alarm-button {
  align-items: center;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(16, 35, 63, 0.2);
  border-radius: 999px;
  box-shadow: 0 5px 16px rgba(15, 23, 42, 0.2);
  color: #17324f;
  display: inline-flex;
  height: 44px;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
  pointer-events: auto;
  position: absolute;
  right: 14px;
  top: 42%;
  transform: translateY(-50%);
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    background-color 180ms ease;
  width: 44px;
  z-index: 2;
}

.fullscreen-station-panel__alarm-button svg {
  height: 21px;
  width: 21px;
}

.fullscreen-station-panel__alarm-button--secondary {
  bottom: 15%;
  top: auto;
  transform: none;
}

.fullscreen-station-panel__alarm-button--cell {
  bottom: 18px;
  right: 18px;
  top: auto;
  transform: none;
}

.fullscreen-station-panel__alarm-actions--home
  .fullscreen-station-panel__alarm-button {
  left: calc(50% - 56px);
  right: auto;
  top: 50%;
}

.fullscreen-station-panel__alarm-actions--home
  .fullscreen-station-panel__alarm-button--secondary {
  bottom: auto;
  left: auto;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.fullscreen-station-panel__alarm-button--active {
  background: var(--panel-line-color);
  border-color: color-mix(in srgb, var(--panel-line-color) 72%, #000000);
  color: var(--panel-line-text);
}

.fullscreen-station-panel__alarm-button--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
}

.fullscreen-station-panel--dark .fullscreen-station-panel__alarm-button {
  background: rgba(20, 20, 20, 0.92);
  border-color: rgba(255, 255, 255, 0.24);
  color: #f8fafc;
}

.fullscreen-station-panel--dark
  .fullscreen-station-panel__alarm-button--active {
  background: var(--panel-line-color);
  color: var(--panel-line-text);
}

.fullscreen-station-panel__icon-button {
  align-items: center;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(16, 35, 63, 0.14);
  border-radius: 999px;
  color: #17324f;
  display: inline-flex;
  height: 54px;
  justify-content: center;
  padding: 0;
  width: 54px;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__icon-button {
  background: rgba(20, 20, 20, 0.92);
  border-color: rgba(255, 255, 255, 0.22);
  color: #f8fafc;
}

.fullscreen-station-panel__icon-button svg {
  height: 28px;
  width: 28px;
}

.fullscreen-station-panel__menu-wrap {
  position: relative;
}

:global(.fullscreen-station-panel__menu) {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(16, 35, 63, 0.16);
  border-radius: 8px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
  color: #10233f;
  display: grid;
  gap: 4px;
  min-width: 270px;
  padding: 8px;
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
}

:global(.fullscreen-station-panel--dark .fullscreen-station-panel__menu) {
  background: rgba(14, 14, 14, 0.98);
  border-color: rgba(255, 255, 255, 0.18);
  color: #f8fafc;
}

:global(.fullscreen-station-panel__menu button) {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: inherit;
  display: grid;
  font: inherit;
  font-weight: 820;
  gap: 10px;
  grid-template-columns: 18px minmax(0, 1fr);
  justify-items: start;
  min-height: 40px;
  padding: 8px 10px;
  text-align: left;
}

:global(.fullscreen-station-panel__menu button:hover) {
  background: rgba(0, 100, 255, 0.09);
}

:global(.fullscreen-station-panel__menu-heading) {
  border-top: 1px solid rgba(148, 163, 184, 0.24);
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 920;
  margin-top: 4px;
  padding: 10px 10px 4px;
  text-transform: uppercase;
}

:global(.fullscreen-station-panel__theme-toggle) {
  align-items: center;
  cursor: pointer;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 44px;
  padding: 8px 10px;
}

:global(.fullscreen-station-panel__theme-toggle input) {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

:global(.fullscreen-station-panel__theme-toggle > span) {
  background: #d8dee8;
  border-radius: 999px;
  display: block;
  height: 28px;
  position: relative;
  width: 48px;
}

:global(.fullscreen-station-panel__theme-toggle > span::after) {
  background: #ffffff;
  border-radius: 999px;
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.24);
  content: "";
  height: 22px;
  left: 3px;
  position: absolute;
  top: 3px;
  transition: transform 160ms ease;
  width: 22px;
}

:global(.fullscreen-station-panel__theme-toggle input:checked + span) {
  background: #ffe600;
}

:global(.fullscreen-station-panel__theme-toggle input:checked + span::after) {
  transform: translateX(20px);
}

.fullscreen-station-panel__header,
.fullscreen-station-panel__panam-header,
.fullscreen-station-panel__home-card header {
  align-items: center;
  display: flex;
  gap: 24px;
  min-width: 0;
}

.fullscreen-station-panel__surface--all {
  background: #ffffff;
  border-bottom: 26px solid var(--panel-line-color);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.fullscreen-station-panel__header {
  border-bottom: 6px solid var(--panel-line-color);
  padding: 34px 132px 28px 42px;
}

.fullscreen-station-panel__logo {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  min-width: 132px;
}

:slotted(.line-icon-badge) {
  height: 110px;
  min-width: 124px;
}

:slotted(.line-icon-badge img) {
  max-height: 110px;
  max-width: 156px;
}

.fullscreen-station-panel__logo :deep(.line-icon-badge) {
  height: 110px;
  min-width: 124px;
}

.fullscreen-station-panel__logo :deep(.line-icon-badge img) {
  max-height: 110px;
  max-width: 156px;
}

.fullscreen-station-panel__logo :deep(.line-icon-badge__fallback) {
  height: 110px;
}

.fullscreen-station-panel__logo :deep(.line-icon-badge__label) {
  font-size: 2.9rem;
  min-width: 110px;
}

.fullscreen-station-panel__line-fallback {
  align-items: center;
  background: var(--panel-line-color);
  border-radius: 8px;
  color: var(--panel-line-text);
  display: inline-flex;
  font-size: 3.1rem;
  font-weight: 950;
  justify-content: center;
  min-height: 110px;
  min-width: 124px;
  padding: 0 18px;
}

.fullscreen-station-panel__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.fullscreen-station-panel__heading p,
.fullscreen-station-panel__panam-header p,
.fullscreen-station-panel__home-card header p {
  color: #68758d;
  font-size: 1.05rem;
  font-weight: 900;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.fullscreen-station-panel h1 {
  color: #082442;
  font-size: 4.8rem;
  font-weight: 950;
  line-height: 0.95;
  margin: 0;
  overflow-wrap: anywhere;
}

.fullscreen-station-panel__heading span,
.fullscreen-station-panel__home-card header span {
  color: #64748b;
  display: block;
  font-size: 1.25rem;
  font-weight: 820;
  margin-top: 8px;
}

.fullscreen-station-panel__alert {
  background: #eab308;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 950;
  margin-left: auto;
  min-height: 42px;
  padding: 0 18px;
  text-transform: uppercase;
}

.fullscreen-station-panel__alert:hover,
.fullscreen-station-panel__alert:focus-visible,
.fullscreen-station-panel__panam-side:hover,
.fullscreen-station-panel__panam-side:focus-visible {
  filter: brightness(0.96);
}

.fullscreen-station-panel__alert:focus-visible,
.fullscreen-station-panel__panam-side:focus-visible {
  outline: 4px solid #2563eb;
  outline-offset: 3px;
}

.fullscreen-station-panel__alert--red {
  background: #ef4444;
}

.fullscreen-station-panel__alert--upcoming {
  animation: fullscreen-traffic-border-wave 2.8s linear infinite;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    linear-gradient(
        120deg,
        rgba(176, 0, 103, 0.28),
        rgba(255, 212, 0, 0.9),
        rgba(37, 99, 235, 0.48),
        rgba(176, 0, 103, 0.28)
      )
      border-box;
  background-size: 100% 100%, 240% 240%;
  border: 1px solid transparent;
  color: #18142f;
}

@keyframes fullscreen-traffic-border-wave {
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
  .fullscreen-station-panel__alert--upcoming {
    animation: none;
  }
}

.fullscreen-station-panel__all-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  min-height: 0;
}

.fullscreen-station-panel__direction {
  align-content: center;
  border-right: 2px solid rgba(15, 23, 42, 0.14);
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 30px 42px 42px;
  text-align: center;
}

.fullscreen-station-panel__direction:last-child {
  border-right: 0;
}

.fullscreen-station-panel__direction h2 {
  color: #082442;
  font-size: 3.1rem;
  font-weight: 940;
  line-height: 1;
  margin: 0;
  overflow-wrap: anywhere;
}

.fullscreen-station-panel__direction p,
.fullscreen-station-panel__direction small {
  color: #607089;
  font-size: 1.05rem;
  font-weight: 820;
  margin: 0;
}

.fullscreen-station-panel__giant-time {
  color: var(--panel-line-color);
  display: block;
  font-size: 11rem;
  font-weight: 950;
  line-height: 0.9;
  margin-top: 18px;
}

.fullscreen-station-panel__next-time {
  color: color-mix(in srgb, var(--panel-line-color) 82%, white);
  display: block;
  font-size: 3.3rem;
  font-weight: 950;
  justify-self: end;
  line-height: 1;
  min-width: 72px;
}

.fullscreen-station-panel__footer {
  align-items: center;
  color: #64748b;
  display: flex;
  font-weight: 820;
  min-height: 34px;
  padding: 0 42px 12px;
}

.fullscreen-station-panel__surface--double {
  background: #f7f7f4;
  color: #101010;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.fullscreen-station-panel__panam-header {
  background: #ffffff;
  border-bottom: 7px solid var(--panel-line-color);
  min-height: 126px;
  padding: 26px 132px 20px 36px;
}

.fullscreen-station-panel__panam-title {
  align-items: baseline;
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 18px;
  min-width: 0;
}

.direction-label {
  color: #9aa4b7;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1;
}

.fullscreen-station-panel__panam-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}

.fullscreen-station-panel__panam-body--with-side {
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
}

.fullscreen-station-panel__panam-times {
  align-items: center;
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
}

.fullscreen-station-panel__panam-times > div {
  align-content: center;
  display: grid;
  gap: 16px;
  height: 100%;
  justify-items: center;
  padding: 34px;
}

.fullscreen-station-panel__panam-times > div + div {
  border-left: 4px solid currentColor;
}

.fullscreen-station-panel__panam-times > div > span {
  font-size: 1.45rem;
  font-weight: 920;
}

.transport-cell-title-text {
  color: #101010;
}

.fullscreen-station-panel__panam-times strong {
  color: var(--panel-line-color);
  display: block;
  font-size: 13rem;
  font-weight: 950;
  line-height: 0.85;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-align: center;
  white-space: nowrap;
}

.fullscreen-station-panel__panam-side {
  align-content: start;
  background: #ffffff;
  border-left: 1px solid rgba(15, 23, 42, 0.16);
  display: grid;
  gap: 12px;
  padding: 32px 28px;
  cursor: pointer;
}

.fullscreen-station-panel__panam-side strong {
  color: #111827;
  font-size: 2rem;
  line-height: 1;
}

.fullscreen-station-panel__panam-side span,
.fullscreen-station-panel__panam-side small {
  color: #64748b;
  font-weight: 820;
}

.fullscreen-station-panel__panam-side p {
  background: #fff7d1;
  border-left: 7px solid #eab308;
  font-size: 1.15rem;
  font-weight: 920;
  line-height: 1.25;
  margin: 8px 0 0;
  padding: 14px 16px;
}

.fullscreen-station-panel__surface--home {
  align-items: stretch;
  background: #dfe7f6;
  display: grid;
}

.fullscreen-station-panel__home-card {
  background: #ffffff;
  border-top: 12px solid #6e8ef3;
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(16, 35, 63, 0.14);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}

.fullscreen-station-panel__home-card header {
  border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  padding: 36px 132px 30px 36px;
}

.fullscreen-station-panel__home-directions {
  display: grid;
  min-height: 0;
}

.fullscreen-station-panel__home-direction {
  align-items: center;
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 128px;
  padding: 24px 34px;
}

.fullscreen-station-panel__home-direction p {
  color: #6d87e8;
  font-size: 1rem;
  font-weight: 950;
  margin: 0 0 6px;
}

.fullscreen-station-panel__home-direction strong {
  color: #192342;
  display: block;
  font-size: 2.4rem;
  line-height: 1.04;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.fullscreen-station-panel__home-times {
  display: flex;
  gap: 24px;
}

.fullscreen-station-panel__home-times > span {
  align-items: center;
  background: #191919;
  border-radius: 6px;
  color: #f3f000;
  display: inline-flex;
  font-size: 5rem;
  font-weight: 950;
  justify-content: center;
  max-width: 100%;
  min-height: 62px;
  min-width: 118px;
  overflow: hidden;
  padding: 0 18px;
  white-space: nowrap;
}

.fullscreen-station-panel__giant-time,
.fullscreen-station-panel__next-time {
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.fullscreen-station-panel__wait-label-line {
  display: block;
  font-size: inherit;
  font-weight: inherit;
  min-width: 0;
}

.fullscreen-station-panel__wait-label--stacked {
  line-height: 0.78;
  white-space: normal;
}

.fullscreen-station-panel__wait-label--stacked
  .fullscreen-station-panel__wait-label-line {
  line-height: 0.78;
}

.fullscreen-station-panel__home-times
  span.fullscreen-station-panel__wait-label--stacked {
  flex-direction: column;
}

.fullscreen-station-panel__home-card footer {
  align-items: center;
  color: #64748b;
  display: flex;
  font-weight: 850;
  justify-content: space-between;
  min-height: 58px;
  padding: 0 34px;
}

.fullscreen-station-panel__notice {
  align-self: center;
  color: #64748b;
  font-size: 2rem;
  font-weight: 900;
  justify-self: center;
  padding: 32px;
}

.fullscreen-station-panel--dark {
  color: #f8fafc;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__surface--all,
.fullscreen-station-panel--dark .fullscreen-station-panel__surface--double,
.fullscreen-station-panel--dark .fullscreen-station-panel__surface--home {
  background: #050505;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__header,
.fullscreen-station-panel--dark .fullscreen-station-panel__panam-header,
.fullscreen-station-panel--dark .fullscreen-station-panel__home-card header {
  background: #ffffff;
  border-bottom-color: var(--panel-line-color);
}

.fullscreen-station-panel--dark .fullscreen-station-panel__surface--all {
  border-bottom-color: var(--panel-line-color);
}

.fullscreen-station-panel--dark .fullscreen-station-panel__home-card {
  background: #0a0a0a;
  border-color: var(--panel-line-color);
  box-shadow: none;
}

.fullscreen-station-panel--dark h1,
.fullscreen-station-panel--dark .fullscreen-station-panel__direction h2,
.fullscreen-station-panel--dark
  .fullscreen-station-panel__home-direction
  strong,
.fullscreen-station-panel--dark .fullscreen-station-panel__panam-side strong {
  color: #f8fafc;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__header h1,
.fullscreen-station-panel--dark .fullscreen-station-panel__panam-header h1,
.fullscreen-station-panel--dark .fullscreen-station-panel__home-card header h1 {
  color: #082442;
}

.fullscreen-station-panel--dark .direction-label {
  color: #9aa4b7;
}

.fullscreen-station-panel--dark .transport-cell-title-text,
.fullscreen-station-panel--dark .transport-cell-title-text.first {
  color: #ffffff;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__heading p,
.fullscreen-station-panel--dark .fullscreen-station-panel__panam-header p,
.fullscreen-station-panel--dark .fullscreen-station-panel__home-card header p,
.fullscreen-station-panel--dark .fullscreen-station-panel__heading span,
.fullscreen-station-panel--dark
  .fullscreen-station-panel__home-card
  header
  span,
.fullscreen-station-panel--dark .fullscreen-station-panel__direction p,
.fullscreen-station-panel--dark .fullscreen-station-panel__direction small,
.fullscreen-station-panel--dark .fullscreen-station-panel__footer,
.fullscreen-station-panel--dark .fullscreen-station-panel__home-card footer {
  color: #cbd5e1;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__giant-time,
.fullscreen-station-panel--dark .fullscreen-station-panel__next-time,
.fullscreen-station-panel--dark .fullscreen-station-panel__panam-times strong {
  color: #f3f000;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__direction {
  border-color: rgba(255, 255, 255, 0.3);
}

.fullscreen-station-panel--dark .fullscreen-station-panel__panam-side {
  background: #f8f7ef;
  color: #111827;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__panam-side strong {
  color: #111827;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__panam-side p {
  background: #fff7d1;
  color: #111827;
}

.fullscreen-station-panel--dark .fullscreen-station-panel__home-direction {
  border-color: rgba(255, 255, 255, 0.14);
}

.fullscreen-station-panel--dark .fullscreen-station-panel__home-times > span {
  background: #181818;
  color: #f3f000;
}

@media (max-width: 860px) {
  .fullscreen-station-panel__header,
  .fullscreen-station-panel__panam-header,
  .fullscreen-station-panel__home-card header {
    gap: 16px;
    padding: 24px 92px 20px 20px;
  }

  :slotted(.line-icon-badge) {
    height: 68px;
    min-width: 78px;
  }

  :slotted(.line-icon-badge img) {
    max-height: 68px;
    max-width: 100px;
  }

  .fullscreen-station-panel__logo {
    min-width: 78px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge) {
    height: 68px;
    min-width: 78px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge img) {
    max-height: 68px;
    max-width: 100px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge__fallback) {
    height: 68px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge__label) {
    font-size: 1.9rem;
    min-width: 68px;
  }

  .fullscreen-station-panel__line-fallback {
    font-size: 1.9rem;
    min-height: 68px;
    min-width: 78px;
  }

  .fullscreen-station-panel h1 {
    font-size: clamp(2rem, 7vw, 3rem);
    overflow-wrap: normal;
    white-space: nowrap;
  }

  .fullscreen-station-panel__direction h2 {
    font-size: clamp(1.75rem, 5.5vw, 2.2rem);
    overflow-wrap: normal;
    white-space: nowrap;
  }

  .fullscreen-station-panel__giant-time {
    font-size: clamp(5rem, 22vw, 7rem);
  }

  .fullscreen-station-panel__next-time {
    font-size: clamp(2rem, 9vw, 2.5rem);
  }

  .fullscreen-station-panel__panam-body {
    grid-template-columns: 1fr;
  }

  .fullscreen-station-panel__panam-side {
    border-left: 0;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
  }

  .fullscreen-station-panel__panam-times strong {
    font-size: clamp(6rem, 26vw, 10rem);
    width: 100%;
  }

  .fullscreen-station-panel__home-direction {
    align-items: start;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .fullscreen-station-panel__controls {
    gap: 6px;
    padding: 8px;
  }

  .fullscreen-station-panel__icon-button {
    height: 38px;
    width: 38px;
  }

  .fullscreen-station-panel__icon-button svg {
    height: 22px;
    width: 22px;
  }

  :global(.fullscreen-station-panel__menu) {
    min-width: min(270px, calc(100vw - 24px));
  }

  .fullscreen-station-panel__header,
  .fullscreen-station-panel__panam-header,
  .fullscreen-station-panel__home-card header {
    align-items: center;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 142px 8px 10px;
  }

  .fullscreen-station-panel__header {
    border-bottom-width: 5px;
  }

  .fullscreen-station-panel__panam-header {
    min-height: 70px;
  }

  .fullscreen-station-panel__home-card header {
    padding-bottom: 10px;
  }

  .fullscreen-station-panel__logo {
    min-width: 46px;
  }

  :slotted(.line-icon-badge) {
    height: 46px;
    min-width: 46px;
  }

  :slotted(.line-icon-badge img) {
    max-height: 46px;
    max-width: 64px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge) {
    height: 46px;
    min-width: 46px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge img) {
    max-height: 46px;
    max-width: 64px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge__fallback) {
    height: 46px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge__label) {
    font-size: 1.25rem;
    min-width: 46px;
  }

  .fullscreen-station-panel__line-fallback {
    border-radius: 7px;
    font-size: 1.3rem;
    min-height: 46px;
    min-width: 50px;
    padding: 0 10px;
  }

  .fullscreen-station-panel__heading,
  .fullscreen-station-panel__panam-title {
    flex: 1 1 0;
    min-width: 0;
  }

  .fullscreen-station-panel__panam-title {
    align-items: start;
    display: grid;
    gap: 2px;
  }

  .fullscreen-station-panel__heading p,
  .fullscreen-station-panel__home-card header p {
    font-size: clamp(0.62rem, 2.6vw, 0.78rem);
    margin-bottom: 1px;
  }

  .fullscreen-station-panel h1 {
    font-size: clamp(0.85rem, 4.85vw, 1.55rem);
    line-height: 1;
    max-width: 100%;
  }

  .fullscreen-station-panel__heading span,
  .fullscreen-station-panel__home-card header span {
    font-size: clamp(0.68rem, 3vw, 0.9rem);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: clip;
    white-space: nowrap;
  }

  .direction-label {
    font-size: clamp(0.7rem, 3vw, 0.9rem);
    max-width: 100%;
    overflow: hidden;
    text-overflow: clip;
    white-space: nowrap;
  }

  .fullscreen-station-panel__alert {
    flex: 0 1 auto;
    font-size: 0.7rem;
    margin-left: 0;
    min-height: 26px;
    order: 3;
    padding: 0 9px;
  }

  .fullscreen-station-panel__surface--all {
    border-bottom-width: 12px;
  }

  .fullscreen-station-panel__all-grid {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .fullscreen-station-panel__direction {
    border-bottom: 1px solid rgba(15, 23, 42, 0.14);
    border-right: 0;
    gap: 6px;
    min-height: 238px;
    padding: 18px 18px 20px;
  }

  .fullscreen-station-panel__direction h2 {
    font-size: clamp(1.25rem, 7vw, 2rem);
  }

  .fullscreen-station-panel__direction p,
  .fullscreen-station-panel__direction small {
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }

  .fullscreen-station-panel__giant-time {
    font-size: clamp(3.6rem, 24vw, 6.2rem);
    margin-top: 8px;
  }

  .fullscreen-station-panel__next-time {
    font-size: clamp(1.6rem, 9vw, 2.2rem);
    justify-self: center;
    min-width: 0;
    width: 100%;
  }

  .fullscreen-station-panel__footer {
    font-size: 0.78rem;
    min-height: 24px;
    padding: 0 18px 8px;
  }

  .fullscreen-station-panel__panam-times {
    align-items: stretch;
  }

  .fullscreen-station-panel__panam-times > div {
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    padding: 14px 10px;
  }

  .fullscreen-station-panel__panam-times > div + div {
    border-left-width: 3px;
  }

  .fullscreen-station-panel__panam-times > div > span {
    font-size: clamp(0.82rem, 3.5vw, 1rem);
    line-height: 1.05;
    white-space: nowrap;
  }

  .fullscreen-station-panel__panam-times strong {
    font-size: clamp(5rem, 42vw, 10rem);
    line-height: 0.9;
  }

  .fullscreen-station-panel__panam-times
    strong.fullscreen-station-panel__wait-label--stacked {
    font-size: clamp(3.8rem, 20vw, 5rem);
    line-height: 0.76;
  }

  .fullscreen-station-panel__panam-side {
    gap: 8px;
    padding: 18px 16px;
  }

  .fullscreen-station-panel__panam-side strong {
    font-size: 1.25rem;
  }

  .fullscreen-station-panel__panam-side p {
    font-size: 0.92rem;
    padding: 10px 12px;
  }

  .fullscreen-station-panel__home-card {
    border-radius: 0;
    border-top-width: 8px;
  }

  .fullscreen-station-panel__home-directions {
    overflow: auto;
  }

  .fullscreen-station-panel__home-direction {
    gap: 12px;
    min-height: 102px;
    padding: 16px;
  }

  .fullscreen-station-panel__home-direction p {
    font-size: 0.75rem;
    margin-bottom: 4px;
  }

  .fullscreen-station-panel__home-direction strong {
    font-size: clamp(1.2rem, 6vw, 2rem);
    white-space: nowrap;
  }

  .fullscreen-station-panel__home-times {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .fullscreen-station-panel__home-times > span {
    font-size: clamp(2rem, 12vw, 3.2rem);
    min-height: 48px;
    min-width: 0;
    padding: 0 8px;
    width: 100%;
  }

  .fullscreen-station-panel__home-card footer {
    font-size: 0.78rem;
    min-height: 42px;
    padding: 0 16px;
  }

  .fullscreen-station-panel__notice {
    font-size: clamp(1.2rem, 5vw, 2rem);
    padding: 20px;
    text-align: center;
  }
}

@media (max-width: 380px) {
  .fullscreen-station-panel__controls {
    gap: 5px;
    padding: 7px;
  }

  .fullscreen-station-panel__icon-button {
    height: 36px;
    width: 36px;
  }

  .fullscreen-station-panel__icon-button svg {
    height: 20px;
    width: 20px;
  }

  .fullscreen-station-panel__header,
  .fullscreen-station-panel__panam-header,
  .fullscreen-station-panel__home-card header {
    gap: 7px;
    padding: 8px 132px 7px 8px;
  }

  .fullscreen-station-panel__logo {
    min-width: 40px;
  }

  :slotted(.line-icon-badge) {
    height: 40px;
    min-width: 40px;
  }

  :slotted(.line-icon-badge img) {
    max-height: 40px;
    max-width: 58px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge) {
    height: 40px;
    min-width: 40px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge img) {
    max-height: 40px;
    max-width: 58px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge__fallback) {
    height: 40px;
  }

  .fullscreen-station-panel__logo :deep(.line-icon-badge__label) {
    font-size: 1.08rem;
    min-width: 40px;
  }

  .fullscreen-station-panel__line-fallback {
    font-size: 1.12rem;
    min-height: 40px;
    min-width: 42px;
    padding: 0 8px;
  }

  .fullscreen-station-panel h1 {
    font-size: clamp(0.75rem, 4.7vw, 1.18rem);
  }

  .fullscreen-station-panel__heading span,
  .fullscreen-station-panel__home-card header span,
  .direction-label {
    font-size: clamp(0.64rem, 2.9vw, 0.78rem);
  }

  .fullscreen-station-panel__panam-times > div {
    padding: 12px 7px;
  }

  .fullscreen-station-panel__panam-times strong {
    font-size: clamp(4.6rem, 40vw, 9rem);
  }
}

/* Dense PANAM board: shared line colours, compact rows and responsive type. */
.fullscreen-station-panel__dense {
  --dense-bg: #f3f6fa;
  --dense-row: #ffffff;
  --dense-alt: #e8eef6;
  --dense-ink: #102b49;
  --dense-muted: #506880;
  --dense-time: #163c64;
  background: var(--dense-bg);
  color: var(--dense-ink);
  padding: clamp(16px, 3vw, 48px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.fullscreen-station-panel--dark .fullscreen-station-panel__dense {
  --dense-bg: #080f1b;
  --dense-row: #14243c;
  --dense-alt: #1b304d;
  --dense-ink: #f4f7fc;
  --dense-muted: #adc0d9;
  --dense-time: #f4db55;
}
.fullscreen-station-panel__dense-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 190px 24px 0;
  border-bottom: 3px solid var(--panel-line-color);
}
.fullscreen-station-panel__dense-header .fullscreen-station-panel__logo {
  width: clamp(64px, 7vw, 110px);
  flex-shrink: 0;
}
.fullscreen-station-panel__dense-heading {
  min-width: 0;
}
.fullscreen-station-panel__dense-heading p {
  margin: 0 0 6px;
  color: var(--dense-muted);
  font-size: clamp(13px, 1.4vw, 20px);
}
.fullscreen-station-panel__dense-heading h1 {
  margin: 0;
  font-size: clamp(26px, 3.8vw, 56px);
  line-height: 1.1;
  letter-spacing: -0.035em;
  overflow-wrap: anywhere;
}
.fullscreen-station-panel__dense-list {
  flex-shrink: 0;
  list-style: none;
  padding: 0;
  margin: 0;
  border-radius: 18px;
  overflow: hidden;
}
.fullscreen-station-panel__dense-row {
  position: relative;
  display: grid;
  grid-template-columns: clamp(82px, 9vw, 140px) minmax(0, 1fr) auto minmax(
      85px,
      0.18fr
    ) 44px;
  align-items: center;
  gap: clamp(12px, 2vw, 32px);
  padding: clamp(12px, 1.4vh, 18px) clamp(14px, 2vw, 30px);
  background: var(--dense-row);
  border-inline-start: 4px solid var(--panel-line-color);
}
.fullscreen-station-panel__dense-row:nth-child(even) {
  background: var(--dense-alt);
}
.fullscreen-station-panel__dense-mission,
.fullscreen-station-panel__dense-destination {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.fullscreen-station-panel__dense-mission strong {
  font-size: clamp(16px, 1.9vw, 28px);
  letter-spacing: 0.04em;
}
.fullscreen-station-panel__dense-mission time {
  font-size: clamp(14px, 1.5vw, 22px);
  color: var(--dense-muted);
  font-variant-numeric: tabular-nums;
}
.fullscreen-station-panel__dense-destination > strong {
  font-size: clamp(20px, 2.6vw, 38px);
  line-height: 1.15;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}
.fullscreen-station-panel__dense-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.fullscreen-station-panel__dense-destination small {
  color: var(--dense-muted);
  font-size: clamp(12px, 1.2vw, 18px);
  overflow-wrap: anywhere;
}
.fullscreen-station-panel__dense-platform {
  grid-column: 3;
  font-size: clamp(12px, 1.4vw, 21px);
  border: 1px solid var(--dense-muted);
  border-radius: 8px;
  padding: 7px 10px;
  white-space: nowrap;
}
.fullscreen-station-panel__dense-wait {
  grid-column: 4;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 7px;
  color: var(--dense-time);
  font-variant-numeric: tabular-nums;
}
.fullscreen-station-panel__dense-wait strong {
  font-size: clamp(24px, 3.6vw, 54px);
  line-height: 1;
  white-space: nowrap;
}
.fullscreen-station-panel__dense-wait small {
  font-size: clamp(12px, 1.2vw, 18px);
}
.fullscreen-station-panel__dense-row .fullscreen-station-panel__alarm-button {
  grid-column: 5;
  position: static;
  transform: none;
}
.fullscreen-station-panel__dense-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--dense-muted);
  font-size: 13px;
  margin-top: auto;
  padding-top: 8px;
}
.fullscreen-station-panel__dense-traffic {
  text-align: left;
  color: var(--dense-ink);
  background: var(--dense-alt);
  border: 0;
  border-left: 4px solid var(--panel-line-color);
  border-radius: 8px;
  padding: 12px 18px;
  cursor: pointer;
  font: inherit;
}
@media (max-width: 650px) {
  .fullscreen-station-panel__dense {
    padding: 16px 10px;
    gap: 14px;
  }
  .fullscreen-station-panel__dense-header {
    padding: 62px 6px 18px;
    gap: 14px;
  }
  .fullscreen-station-panel__dense-row {
    grid-template-columns: 60px minmax(0, 1fr) 70px;
    gap: 8px 12px;
    padding: 14px 10px;
  }
  .fullscreen-station-panel__dense-mission strong {
    font-size: 14px;
  }
  .fullscreen-station-panel__dense-mission time {
    font-size: 12px;
  }
  .fullscreen-station-panel__dense-destination > strong {
    font-size: 19px;
  }
  .fullscreen-station-panel__dense-wait {
    grid-column: 3;
    grid-row: 1;
    flex-wrap: wrap;
    gap: 3px;
  }
  .fullscreen-station-panel__dense-wait strong {
    font-size: 28px;
    white-space: normal;
    text-align: right;
  }
  .fullscreen-station-panel__dense-platform {
    grid-column: 2;
    justify-self: start;
    font-size: 12px;
    padding: 3px 7px;
  }
  .fullscreen-station-panel__dense-row .fullscreen-station-panel__alarm-button {
    position: absolute;
    right: 10px;
    top: auto;
    bottom: 8px;
    transform: none;
  }
}

.fullscreen-station-panel__panam-times > div > .fullscreen-station-panel__panam-platform {
  border: 2px solid currentColor;
  border-radius: 10px;
  padding: 8px 18px;
  color: inherit;
  font-size: clamp(1rem, 2.6vw, 2rem);
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
  max-width: 100%;
}
</style>
