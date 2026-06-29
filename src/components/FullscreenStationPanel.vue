<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Check,
  EllipsisVertical,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-vue-next";
import ContextMenu from "./ContextMenu.vue";
import type { FullscreenStationPanelDesign } from "../features/app-settings";

type TrafficAlertTone = "orange" | "red";

interface FullscreenPanelDeparture {
  id: string;
  waitLabel: string;
  destination?: string;
  meta?: string;
  statusLabel?: string;
}

interface FullscreenPanelDirection {
  id: string;
  label: string;
  subtitle?: string;
  serviceEnded?: boolean;
  departures: FullscreenPanelDeparture[];
}

interface FullscreenPanelTrafficAlert {
  label: string;
  tone: TrafficAlertTone;
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
    directions?: FullscreenPanelDirection[];
    design?: FullscreenStationPanelDesign;
    darkTheme?: boolean;
    panamDirectionId?: string;
    trafficAlert?: FullscreenPanelTrafficAlert;
    loading?: boolean;
    error?: string;
    updatedAtLabel?: string;
    browserFullscreenActive?: boolean;
  }>(),
  {
    city: "",
    lineColor: "#4d7c0f",
    lineTextColor: "#ffffff",
    transportTypeLabel: "transport",
    directions: () => [],
    design: "all-directions",
    darkTheme: false,
    panamDirectionId: undefined,
    trafficAlert: undefined,
    loading: false,
    error: "",
    updatedAtLabel: "",
    browserFullscreenActive: false,
  },
);

const emit = defineEmits<{
  close: [];
  "change-design": [
    payload: {
      design: FullscreenStationPanelDesign;
      panamDirectionId?: string;
    },
  ];
  "change-theme": [darkTheme: boolean];
  refresh: [];
  "toggle-fullscreen": [];
}>();

const controlsVisible = ref(true);
const menuOpen = ref(false);
const menuTrigger = ref<HTMLElement>();
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

const hasDirections = computed(() => props.directions.length > 0);

function getDeparture(
  direction: FullscreenPanelDirection | undefined,
  index: number,
): FullscreenPanelDeparture | undefined {
  return direction?.departures[index];
}

function getWaitLabel(
  direction: FullscreenPanelDirection | undefined,
  departure: FullscreenPanelDeparture | undefined,
): string {
  if (props.loading) {
    return "...";
  }

  if (direction?.serviceEnded) {
    return "Termine";
  }

  return departure?.waitLabel || "--";
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

  if (menuOpen.value) {
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

function isSelectedDoubleStopDirection(directionId: string): boolean {
  return (
    props.design === "double-stop" &&
    selectedDoubleStopDirection.value?.id === directionId
  );
}

function toggleDarkTheme(event: Event): void {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;

  emit("change-theme", checked);
  controlsVisible.value = true;
}

function handleKeydown(event: KeyboardEvent): void {
  revealControls();

  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();

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
        aria-label="Rafraichir le panneau"
        @click="emit('refresh')"
      >
        <RefreshCw aria-hidden="true" />
      </button>

      <div class="fullscreen-station-panel__menu-wrap">
        <button
          ref="menuTrigger"
          class="fullscreen-station-panel__icon-button"
          type="button"
          aria-label="Options du panneau"
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
            <strong>Theme sombre</strong>
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
                ? "Sortir du plein ecran"
                : "Plein ecran"
            }}
          </button>

          <div class="fullscreen-station-panel__menu-heading">
            Changer le design
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
            Toutes directions
          </button>

          <button
            v-for="direction in directions"
            :key="`double-${direction.id}`"
            type="button"
            role="menuitem"
            @click="selectDoubleStopDesign(direction.id)"
          >
            <Check
              v-if="isSelectedDoubleStopDirection(direction.id)"
              :size="17"
              aria-hidden="true"
            />
            <span v-else aria-hidden="true"></span>
            Double arret - {{ direction.label }}
          </button>

          <button type="button" role="menuitem" @click="selectHomeCardDesign">
            <Check
              v-if="design === 'home-card'"
              :size="17"
              aria-hidden="true"
            />
            <span v-else aria-hidden="true"></span>
            Carte station
          </button>
        </ContextMenu>
      </div>

      <button
        class="fullscreen-station-panel__icon-button"
        type="button"
        aria-label="Fermer le panneau"
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
          <h1 id="fullscreen-station-panel-title">{{ stationName }}</h1>
          <span v-if="city">{{ city }}</span>
        </div>
        <button
          v-if="trafficAlert"
          class="fullscreen-station-panel__alert"
          :class="`fullscreen-station-panel__alert--${trafficAlert.tone}`"
          type="button"
        >
          {{ trafficAlert.label }}
        </button>
      </header>

      <div v-if="error" class="fullscreen-station-panel__notice">
        {{ error }}
      </div>
      <div
        v-else-if="loading && !hasDirections"
        class="fullscreen-station-panel__notice"
      >
        Chargement
      </div>
      <div v-else class="fullscreen-station-panel__all-grid">
        <section
          v-for="direction in directions"
          :key="direction.id"
          class="fullscreen-station-panel__direction"
        >
          <h2>{{ direction.label }}</h2>
          <p v-if="direction.subtitle">{{ direction.subtitle }}</p>
          <strong class="fullscreen-station-panel__giant-time">
            {{ getWaitLabel(direction, getDeparture(direction, 0)) }}
          </strong>
          <span class="fullscreen-station-panel__next-time">
            {{ getWaitLabel(direction, getDeparture(direction, 1)) }}
          </span>
          <small>
            {{ getDestinationLabel(direction, getDeparture(direction, 0)) }}
          </small>
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
          <h1 id="fullscreen-station-panel-title">{{ stationName }}</h1>
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
            <strong>
              {{
                getWaitLabel(
                  selectedDoubleStopDirection,
                  getDeparture(selectedDoubleStopDirection, 0),
                )
              }}
            </strong>
          </div>
          <div>
            <span class="transport-cell-title-text second">
              2e {{ transportTypeLabel }}
            </span>
            <strong>
              {{
                getWaitLabel(
                  selectedDoubleStopDirection,
                  getDeparture(selectedDoubleStopDirection, 1),
                )
              }}
            </strong>
          </div>
        </section>

        <aside v-if="trafficAlert" class="fullscreen-station-panel__panam-side">
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
          <div>
            <p>{{ lineName }}</p>
            <h1 id="fullscreen-station-panel-title">{{ stationName }}</h1>
            <span v-if="city">{{ city }}</span>
          </div>
          <button
            v-if="trafficAlert"
            class="fullscreen-station-panel__alert"
            :class="`fullscreen-station-panel__alert--${trafficAlert.tone}`"
            type="button"
          >
            {{ trafficAlert.label }}
          </button>
        </header>

        <div v-if="error" class="fullscreen-station-panel__notice">
          {{ error }}
        </div>
        <div v-else class="fullscreen-station-panel__home-directions">
          <section
            v-for="direction in directions"
            :key="direction.id"
            class="fullscreen-station-panel__home-direction"
          >
            <div>
              <p>DIRECTION</p>
              <strong>{{ direction.label }}</strong>
            </div>
            <div class="fullscreen-station-panel__home-times">
              <span>
                {{ getWaitLabel(direction, getDeparture(direction, 0)) }}
              </span>
              <span>
                {{ getWaitLabel(direction, getDeparture(direction, 1)) }}
              </span>
            </div>
          </section>
        </div>

        <footer>
          <span
            >{{ directions.length }} direction{{
              directions.length > 1 ? "s" : ""
            }}</span
          >
          <span v-if="updatedAtLabel">{{ updatedAtLabel }}</span>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.fullscreen-station-panel {
  --panel-line-color: #4d7c0f;
  --panel-line-text: #ffffff;
  background: #050505;
  color: #0b2440;
  display: grid;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
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

.fullscreen-station-panel__alert--red {
  background: #ef4444;
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

.fullscreen-station-panel__panam-times span {
  font-size: 1.45rem;
  font-weight: 920;
}

.transport-cell-title-text {
  color: #101010;
}

.fullscreen-station-panel__panam-times strong {
  color: var(--panel-line-color);
  font-size: 13rem;
  font-weight: 950;
  line-height: 0.85;
}

.fullscreen-station-panel__panam-side {
  align-content: start;
  background: #ffffff;
  border-left: 1px solid rgba(15, 23, 42, 0.16);
  display: grid;
  gap: 12px;
  padding: 32px 28px;
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
  font-size: 2.4rem;
  line-height: 1.04;
}

.fullscreen-station-panel__home-times {
  display: flex;
  gap: 24px;
}

.fullscreen-station-panel__home-times span {
  align-items: center;
  background: #191919;
  border-radius: 6px;
  color: #f3f000;
  display: inline-flex;
  font-size: 5rem;
  font-weight: 950;
  justify-content: center;
  min-height: 62px;
  min-width: 118px;
  padding: 0 18px;
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

.fullscreen-station-panel--dark .fullscreen-station-panel__home-times span {
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

  .fullscreen-station-panel__line-fallback {
    font-size: 1.9rem;
    min-height: 68px;
    min-width: 78px;
  }

  .fullscreen-station-panel h1 {
    font-size: 3rem;
  }

  .fullscreen-station-panel__direction h2 {
    font-size: 2.2rem;
  }

  .fullscreen-station-panel__giant-time {
    font-size: 7rem;
  }

  .fullscreen-station-panel__next-time {
    font-size: 2.5rem;
  }

  .fullscreen-station-panel__panam-body {
    grid-template-columns: 1fr;
  }

  .fullscreen-station-panel__panam-side {
    border-left: 0;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
  }

  .fullscreen-station-panel__panam-times strong {
    font-size: 8rem;
  }

  .fullscreen-station-panel__home-direction {
    align-items: start;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .fullscreen-station-panel__controls {
    padding: 12px;
  }

  .fullscreen-station-panel__icon-button {
    height: 46px;
    width: 46px;
  }

  :global(.fullscreen-station-panel__menu) {
    min-width: min(270px, calc(100vw - 24px));
  }

  .fullscreen-station-panel__header,
  .fullscreen-station-panel__panam-header,
  .fullscreen-station-panel__home-card header {
    align-items: flex-start;
    flex-direction: column;
    padding-right: 72px;
  }

  .fullscreen-station-panel__alert {
    margin-left: 0;
  }

  .fullscreen-station-panel__all-grid {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .fullscreen-station-panel__direction {
    border-bottom: 1px solid rgba(15, 23, 42, 0.14);
    border-right: 0;
    min-height: 310px;
  }

  .fullscreen-station-panel__home-times {
    flex-wrap: wrap;
  }
}
</style>
