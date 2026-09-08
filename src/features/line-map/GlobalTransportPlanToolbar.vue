<template>
  <header v-if="showMapInteractions" class="global-transport-plan__toolbar">
    <div class="global-transport-plan__toolbar-brand">
      <p class="global-transport-plan__eyebrow">{{ t("globalMap.page.brand") }}</p>
      <h1>{{ t("globalMap.page.title") }}</h1>
      <p class="global-transport-plan__subtitle">
        {{ statusLabel }}
        <span v-if="rendererMetrics">
          {{
            t("globalMap.page.rendererMetrics", {
              renderer: rendererMetrics.renderer,
              ms: rendererMetrics.renderMs.toFixed(1),
            })
          }}
        </span>
        <span
          v-if="rendererMetrics"
          class="global-transport-plan__zoom-metric"
          data-global-map-zoom-metric
        >
          {{ t("globalMap.page.zoom", { value: displayZoom.toFixed(1) }) }}
        </span>
      </p>
    </div>
    <div
      ref="actionsElement"
      class="global-transport-plan__actions"
      :aria-label="t('globalMap.page.actionsAria')"
      @click="handleActionsClick"
    >
      <div
        id="global-map-advanced-menu"
        v-show="advancedOpen"
        class="global-transport-plan__advanced-menu"
        role="menu"
        :aria-label="t('globalMap.page.advancedMenuAria')"
      >
        <div class="global-transport-plan__advanced-metrics" role="status">
          <span>{{ statusLabel }}</span>
          <span v-if="rendererMetrics">
            {{ t("globalMap.page.rendererMetrics", { renderer: rendererMetrics.renderer, ms: rendererMetrics.renderMs.toFixed(1) }) }}
          </span>
          <span v-if="rendererMetrics">{{ t("globalMap.page.zoom", { value: displayZoom.toFixed(1) }) }}</span>
        </div>
      <PatternTrafficCalendarToggle
        v-if="trafficCalendarEventCount > 0"
        data-global-map-traffic-calendar-toggle
        :active="trafficCalendarOpen"
        :count="trafficCalendarEventCount"
        :next-delay-label="trafficCalendarNextDelayLabel"
        :reduce-motion="reduceMotion"
        @toggle="emit('toggle-traffic-calendar')"
      />
      <button
        type="button"
        class="map-button map-button--chaos"
        data-global-map-chaos-zoom
        :disabled="!hasNetwork || loading || chaosZoomRunning"
        :aria-busy="chaosZoomRunning && chaosZoomActiveProfile === 'standard'"
        @click="emit('run-chaos')"
      >
        {{
          chaosZoomRunning && chaosZoomActiveProfile === "standard"
            ? t("globalMap.page.chaosZoom.running", { step: chaosZoomProgress, total: chaosZoomTotal })
            : t("globalMap.page.chaosZoom.button")
        }}
      </button>
      <button
        type="button"
        class="map-button map-button--chaos map-button--chaos-extreme"
        data-global-map-chaos-zoom-extreme
        :disabled="!hasNetwork || loading || chaosZoomRunning"
        :aria-busy="chaosZoomRunning && chaosZoomActiveProfile === 'extreme'"
        @click="emit('run-chaos-extreme')"
      >
        {{
          chaosZoomRunning && chaosZoomActiveProfile === "extreme"
            ? t("globalMap.page.chaosZoom.extremeRunning", { step: chaosZoomProgress, total: chaosZoomTotal })
            : t("globalMap.page.chaosZoom.extremeButton")
        }}
      </button>
      <button
        v-if="chaosZoomReportAvailable"
        type="button"
        class="map-button map-button--quiet"
        data-global-map-chaos-zoom-download
        @click="emit('download-chaos-report')"
      >
        {{ t("globalMap.page.chaosZoom.downloadReport") }}
      </button>
      <button type="button" class="map-button" @click="emit('reset')">
        {{ t("globalMap.page.reset") }}
      </button>
      <button
        type="button"
        class="map-button"
        data-global-map-share
        @click="emit('share')"
      >
        {{ t("globalMap.page.share") }}
      </button>
      <button
        type="button"
        class="map-button map-button--radar"
        :class="{ 'map-button--radar-active': radarEnabled }"
        :aria-label="t('globalMap.radar.open')"
        :title="t('globalMap.radar.open')"
        :aria-expanded="Boolean(radarPanelOpen)"
        aria-controls="global-map-radar-panel"
        data-global-map-radar-toggle
        @click="emit('open-radar')"
      >
        <Radar :size="18" aria-hidden="true" />
        {{ t("globalMap.radar.title") }}
      </button>
      <button
        type="button"
        class="map-button traffic-switch"
        :class="{ 'traffic-switch--checked': trafficEnabled }"
        role="switch"
        :aria-checked="trafficEnabled"
        :aria-busy="trafficLoading"
        :data-state="trafficState"
        data-global-map-traffic-toggle
        @click="emit('toggle-traffic')"
      >
        <span class="traffic-switch__copy">
          <strong>{{ t("globalMap.page.trafficToggle") }}</strong>
          <small>{{ trafficStatusLabel }}</small>
        </span>
        <span class="traffic-switch__track" aria-hidden="true"><span /></span>
      </button>
      <button type="button" class="map-button map-button--quiet" @click="emit('clear')">
        {{ t("globalMap.page.clear") }}
      </button>
      <div
        v-if="legacyBasemap"
        class="global-transport-plan__layer-control"
        data-global-map-layer-control
        role="group"
        :aria-label="t('globalMap.page.layerAria')"
      >
        <span class="global-transport-plan__layer-label">{{ t("globalMap.page.layerLabel") }}</span>
        <button
          type="button"
          class="global-transport-plan__layer-button"
          :class="{ 'global-transport-plan__layer-button--active': basemapLayer === 'plan' }"
          data-global-map-layer-plan
          :aria-pressed="basemapLayer === 'plan'"
          @click="emit('update:basemap-layer', 'plan')"
        >
          {{ t("globalMap.page.layerPlan") }}
        </button>
        <button
          type="button"
          class="global-transport-plan__layer-button"
          :class="{ 'global-transport-plan__layer-button--active': basemapLayer === 'satellite' }"
          data-global-map-layer-satellite
          :aria-pressed="basemapLayer === 'satellite'"
          @click="emit('update:basemap-layer', 'satellite')"
        >
          {{ t("globalMap.page.layerSatellite") }}
        </button>
        </div>
        <span
          v-if="shareFeedback"
          class="global-transport-plan__share-feedback"
          role="status"
          aria-live="polite"
        >
          {{ shareFeedback }}
        </span>
      </div>
      <button
        type="button"
        class="map-button map-button--advanced"
        :aria-expanded="advancedOpen"
        :aria-label="t('globalMap.page.advancedMenuAria')"
        aria-controls="global-map-advanced-menu"
        data-global-map-advanced-toggle
        @click="toggleAdvanced"
      >
        <SlidersHorizontal :size="16" :stroke-width="2.2" aria-hidden="true" />
        <span class="global-transport-plan__advanced-button-copy">
          <strong>{{ t("globalMap.page.advanced") }}</strong>
          <small>{{ t("globalMap.page.advancedHint") }}</small>
        </span>
        <ChevronDown
          class="global-transport-plan__advanced-button-arrow"
          :size="15"
          :stroke-width="2.25"
          aria-hidden="true"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronDown, Radar, SlidersHorizontal } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import PatternTrafficCalendarToggle from "../service-pattern/PatternTrafficCalendarToggle.vue";
import type { TransportMapBasemapLayer } from "../transport-map/basemap/tileMath";
import type { TransportMapRendererMetrics } from "../transport-map/contracts/renderer";
import type { TransportMapTrafficStatus } from "../transport-map/state/useTransportMapTraffic";

withDefaults(defineProps<{
  statusLabel: string;
  rendererMetrics?: TransportMapRendererMetrics;
  displayZoom: number;
  hasNetwork: boolean;
  loading: boolean;
  chaosZoomRunning: boolean;
  chaosZoomProgress: number;
  chaosZoomTotal: number;
  chaosZoomActiveProfile: "standard" | "extreme";
  chaosZoomReportAvailable: boolean;
  trafficCalendarOpen: boolean;
  trafficCalendarEventCount: number;
  trafficCalendarNextDelayLabel: string;
  reduceMotion: boolean;
  trafficEnabled: boolean;
  trafficLoading: boolean;
  trafficState: TransportMapTrafficStatus;
  trafficStatusLabel: string;
  basemapLayer: TransportMapBasemapLayer;
  legacyBasemap: boolean;
  shareFeedback: string;
  radarEnabled?: boolean;
  radarPanelOpen?: boolean;
  showMapInteractions?: boolean;
}>(), {
  showMapInteractions: true,
});

const emit = defineEmits<{
  "run-chaos": [];
  "run-chaos-extreme": [];
  "download-chaos-report": [];
  reset: [];
  share: [];
  "toggle-traffic-calendar": [];
  "toggle-traffic": [];
  "open-radar": [];
  clear: [];
  "update:basemap-layer": [value: TransportMapBasemapLayer];
}>();

const { t } = useI18n();
const advancedOpen = ref(false);
const actionsElement = ref<HTMLElement>();

function toggleAdvanced(): void {
  advancedOpen.value = !advancedOpen.value;
}

function handleActionsClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-global-map-advanced-toggle]")) return;
  advancedOpen.value = false;
}

function closeAdvancedOnOutsideClick(event: PointerEvent): void {
  if (!advancedOpen.value) return;
  const target = event.target;
  if (target instanceof Node && actionsElement.value?.contains(target)) return;
  advancedOpen.value = false;
}

onMounted(() => {
  document.addEventListener("pointerdown", closeAdvancedOnOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeAdvancedOnOutsideClick);
});
</script>

<style scoped>
.global-transport-plan__toolbar {
  position: absolute;
  z-index: 3;
  top: 0;
  right: 0;
  left: 0;
  height: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 0;
  background: transparent;
  border: 0;
  pointer-events: none;
}
.global-transport-plan__toolbar-brand {
  display: none;
}
.global-transport-plan__toolbar h1,
.global-transport-plan__toolbar p {
  margin: 0;
}
.global-transport-plan__toolbar h1 {
  color: #0f172a;
  font-size: clamp(1.1rem, 2vw, 1.55rem);
  letter-spacing: -0.025em;
}
.global-transport-plan__eyebrow {
  color: #475569;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.global-transport-plan__subtitle {
  margin-top: 3px !important;
  color: #64748b;
  font-size: 0.8rem;
}
.global-transport-plan__zoom-metric {
  display: inline-block;
  margin-left: 0.5rem;
  white-space: nowrap;
}
.global-transport-plan__actions {
  position: absolute;
  top: 18px;
  right: 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  pointer-events: auto;
}
.global-transport-plan__advanced-menu {
  position: absolute;
  z-index: 12;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: min(440px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid rgba(100, 116, 139, 0.22);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(16px);
}
.global-transport-plan__advanced-menu[style*="display: none"] {
  display: none !important;
}
.global-transport-plan__advanced-metrics {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 2px 2px 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1.35;
}
.global-transport-plan__advanced-metrics span + span::before {
  margin-right: 10px;
  color: #cbd5e1;
  content: "·";
}
.map-button--advanced {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 6px 10px 6px 12px;
  background: #fff;
  color: #334155;
}
.global-transport-plan__advanced-button-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  text-align: left;
}
.global-transport-plan__advanced-button-copy strong {
  font-size: 0.76rem;
  line-height: 1;
}
.global-transport-plan__advanced-button-copy small {
  overflow: hidden;
  color: #64748b;
  font-size: 0.59rem;
  font-weight: 750;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-transport-plan__advanced-button-arrow {
  flex: 0 0 auto;
  transition: transform 160ms ease;
}
.map-button--advanced[aria-expanded="true"] .global-transport-plan__advanced-button-arrow {
  transform: rotate(180deg);
}
.map-button--advanced:hover,
.map-button--advanced:focus-visible,
.map-button--advanced[aria-expanded="true"] {
  border-color: #94a3b8;
  background: #f1f5f9;
  color: #0f172a;
}
.global-transport-plan__share-feedback {
  color: #475569;
  font-size: 0.72rem;
}
.global-transport-plan__layer-control {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}
.global-transport-plan__layer-label {
  padding: 0 4px;
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.global-transport-plan__layer-button {
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
}
.global-transport-plan__layer-button:hover {
  background: rgba(241, 245, 249, 0.9);
  color: #0f172a;
}
.global-transport-plan__layer-button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}
.global-transport-plan__layer-button--active {
  background: #0f172a;
  color: #fff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);
}
.global-transport-plan__layer-button--active:hover {
  background: #1e293b;
  color: #fff;
}
.map-button {
  padding: 8px 12px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 9px;
  background: #0f172a;
  color: #fff;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
.map-button:hover,
.map-button:focus-visible {
  background: #1e293b;
}
.map-button--quiet {
  background: transparent;
  color: #334155;
}
.map-button--radar {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  color: #315b91;
}
.map-button--radar:hover,
.map-button--radar:focus-visible,
.map-button--radar-active {
  border-color: #60a5fa;
  background: #eff6ff;
  color: #1d4ed8;
}
.map-button--chaos {
  background: #6d28d9;
}
.map-button--chaos:hover,
.map-button--chaos:focus-visible {
  background: #5b21b6;
}
.map-button:disabled {
  cursor: wait;
  opacity: 0.62;
}
.traffic-switch {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: 124px;
  padding: 6px 8px 6px 10px;
  background: #fff;
  color: #334155;
  text-align: left;
}
.traffic-switch:hover,
.traffic-switch:focus-visible {
  background: #f8fafc;
}
.traffic-switch__copy {
  display: grid;
  flex: 1 1 auto;
  line-height: 1.05;
}
.traffic-switch__copy strong {
  font-size: 0.75rem;
}
.traffic-switch__copy small {
  margin-top: 3px;
  color: #64748b;
  font-size: 0.62rem;
  font-weight: 700;
}
.traffic-switch__track {
  position: relative;
  flex: 0 0 auto;
  width: 31px;
  height: 18px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
}
.traffic-switch__track > span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.35);
  transition: transform 140ms ease;
}
.traffic-switch--checked .traffic-switch__track {
  background: #16a34a;
}
.traffic-switch--checked .traffic-switch__track > span {
  transform: translateX(13px);
}
.traffic-switch[data-state="loading"] .traffic-switch__track {
  background: #2563eb;
}
.traffic-switch[data-state="error"] .traffic-switch__track,
.traffic-switch[data-state="offline"] .traffic-switch__track {
  background: #94a3b8;
}

@media (max-width: 700px) {
  .global-transport-plan__toolbar {
    z-index: 22;
    display: block;
  }
  .global-transport-plan__actions {
    top: calc(env(safe-area-inset-top, 0px) + 76px);
    right: 12px;
  }
  .global-transport-plan__advanced-menu {
    max-height: min(68dvh, 620px);
    overflow-y: auto;
  }
}
</style>
