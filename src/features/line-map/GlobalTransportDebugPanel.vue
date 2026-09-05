<template>
  <details class="global-map-debug" data-global-map-debug>
    <summary>{{ t("globalMap.page.debug.title") }}</summary>
    <div class="global-map-debug__actions">
      <button type="button" class="map-button map-button--small" @click="emit('start')">
        {{ t("globalMap.page.debug.start") }}
      </button>
      <button
        type="button"
        class="map-button map-button--small"
        :disabled="!running"
        @click="emit('stop')"
      >
        {{ t("globalMap.page.debug.stop") }}
      </button>
      <button
        type="button"
        class="map-button map-button--small map-button--quiet"
        :disabled="!report"
        @click="emit('export')"
      >
        {{ t("globalMap.page.debug.export") }}
      </button>
    </div>
    <p v-if="report" class="global-map-debug__summary" aria-live="polite">
      {{
        t("globalMap.page.debug.summary", {
          frames: report.frames,
          median: report.medianFrameTimeMs,
          p95: report.p95FrameTimeMs,
          ratio: report.deliveredFrameRatio,
          presented: report.presentedFrames,
          presentedP95: report.presentedP95FrameTimeMs,
          presentedRatio: report.presentedFrameRatio,
        })
      }}
    </p>
    <p v-if="report?.trace" class="global-map-debug__trace-summary" aria-live="polite">
      {{
        t("globalMap.page.debug.traceSummary", {
          events: report.trace.eventCount,
          spikes: report.trace.totalSpikeCount,
          maplibre: report.trace.maplibre?.sampleCount ?? 0,
        })
      }}
    </p>
    <p class="global-map-debug__loading" aria-live="polite">
      {{
        t("globalMap.page.debug.loadingStage", {
          stage: t(`globalMap.page.debug.loadingStages.${loadingStage}` as never),
        })
      }}
    </p>
    <pre v-if="report" class="global-map-debug__json">{{ reportJson }}</pre>
  </details>
</template>

<script setup lang="ts">
import { useI18n } from "../../i18n";
import type { TransportMapPerformanceReport } from "../transport-map/performance/transportMapPerformance";

defineProps<{
  running: boolean;
  report?: TransportMapPerformanceReport;
  reportJson: string;
  loadingStage: "viewport" | "applying-data" | "building-scene" | "binary" | "presenting" | "ready";
}>();

const emit = defineEmits<{
  start: [];
  stop: [];
  export: [];
}>();

const { t } = useI18n();
</script>

<style scoped>
.global-map-debug {
  position: absolute;
  /* Keep the opt-in diagnostics actionable above the station display panel. */
  z-index: 20;
  left: 16px;
  bottom: 14px;
  width: min(520px, calc(100% - 32px));
  max-height: min(48vh, 420px);
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  color: #334155;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  font-size: 0.72rem;
}
.global-map-debug summary {
  cursor: pointer;
  font-weight: 800;
}
.global-map-debug__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.global-map-debug__summary {
  margin-top: 8px !important;
}
.global-map-debug__loading {
  margin-top: 6px !important;
  color: #475569;
}
.global-map-debug__json {
  max-height: 260px;
  margin: 8px 0 0;
  overflow: auto;
  white-space: pre-wrap;
  font:
    0.65rem/1.35 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
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
.map-button:disabled {
  cursor: wait;
  opacity: 0.62;
}
.map-button--small {
  padding: 6px 9px;
  font-size: 0.72rem;
}

@media (max-width: 700px) {
  .global-map-debug {
    top: auto;
    right: 10px;
    bottom: 42px;
    left: 10px;
    width: auto;
    max-height: 42%;
  }
}
</style>
