<script setup lang="ts">
import { ExternalLink, LoaderCircle } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import { useI18n } from "../../i18n";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { TransitFamily, TransitMode } from "../../types/transit";

type NearbyLineBadge = {
  color?: string;
  family?: TransitFamily;
  iconUrl?: string;
  iconUrls?: string[];
  id?: string;
  label?: string;
  mode?: TransitMode | string;
  ref?: string;
  textColor?: string;
};

const props = defineProps<{
  line: NearbyLineBadge;
  profile?: GtfsLineFrequencyResponse;
  loading?: boolean;
  unavailable?: boolean;
}>();

const emit = defineEmits<{
  "open-line": [];
}>();

const { n, t } = useI18n();

function formatHeadway(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? t("globalMap.sidebar.gtfsFrequency.minutes", { value: n(Math.round(value)) })
    : t("globalMap.sidebar.lineUnavailable");
}
</script>

<template>
  <aside
    class="nearby-line-hover-card"
    data-testid="nearby-line-hover-card"
    data-nearby-map-tooltip
    :aria-label="t('nearbyStations.summaryLineFrequencyAria', { line: line.label ?? line.id ?? '' })"
    @click.stop
    @pointerdown.stop
  >
    <header class="nearby-line-hover-card__header">
      <LineIconBadge :line="props.line" compact eager />
      <div>
        <strong>{{ line.label ?? line.id }}</strong>
        <span>{{ t("nearbyStations.summaryLineFrequencyTitle") }}</span>
      </div>
    </header>

    <div class="nearby-line-hover-card__body" aria-live="polite">
      <div v-if="loading" class="nearby-line-hover-card__status" role="status">
        <LoaderCircle class="nearby-line-hover-card__spinner" :size="14" aria-hidden="true" />
        {{ t("globalMap.sidebar.lineLoading") }}
      </div>
      <template v-else-if="profile?.status === 'ready'">
        <div class="nearby-line-hover-card__frequency">
          <span>{{ t("globalMap.sidebar.linePeak") }}</span>
          <strong>{{ formatHeadway(profile.average.peakMinutes) }}</strong>
        </div>
        <div class="nearby-line-hover-card__frequency">
          <span>{{ t("globalMap.sidebar.lineOffPeak") }}</span>
          <strong>{{ formatHeadway(profile.average.offPeakMinutes) }}</strong>
        </div>
      </template>
      <p v-else class="nearby-line-hover-card__status" role="status">
        {{ t(unavailable ? "globalMap.sidebar.lineFrequencyUnavailable" : "globalMap.sidebar.lineLoading") }}
      </p>
    </div>

    <button
      class="nearby-line-hover-card__details"
      data-testid="nearby-line-hover-card-more-details"
      type="button"
      :aria-label="t('nearbyStations.summaryMoreDetails')"
      @click.stop="emit('open-line')"
    >
      <span>{{ t("nearbyStations.summaryMoreDetails") }}</span>
      <ExternalLink :size="14" aria-hidden="true" />
    </button>
  </aside>
</template>

<style scoped>
.nearby-line-hover-card {
  align-content: start;
  background: rgba(255, 255, 255, .96);
  border: 1px solid rgba(81, 70, 255, .22);
  border-radius: 13px;
  box-shadow: 0 8px 22px rgba(16, 35, 63, .2);
  box-sizing: border-box;
  display: grid;
  gap: 10px;
  left: 12px;
  max-width: min(280px, calc(100% - 24px));
  padding: 10px;
  position: absolute;
  top: 12px;
  width: min(280px, calc(100% - 24px));
  z-index: 100;
}
.nearby-line-hover-card__header {
  align-items: center;
  display: flex;
  gap: 9px;
  min-width: 0;
}
.nearby-line-hover-card__header :deep(.line-icon-badge) { height: 30px; min-width: 38px; }
.nearby-line-hover-card__header :deep(.line-icon-badge img) { max-height: 30px; max-width: 58px; }
.nearby-line-hover-card__header > div { display: grid; gap: 2px; min-width: 0; }
.nearby-line-hover-card__header strong { color: var(--ink); font-size: .82rem; overflow-wrap: anywhere; }
.nearby-line-hover-card__header span { color: var(--muted); font-size: .65rem; font-weight: 760; }
.nearby-line-hover-card__body { display: grid; gap: 5px; }
.nearby-line-hover-card__frequency { align-items: baseline; background: #f5f7fb; border-radius: 7px; display: flex; font-size: .68rem; gap: 8px; justify-content: space-between; padding: 5px 7px; }
.nearby-line-hover-card__frequency span { color: var(--muted); }
.nearby-line-hover-card__frequency strong { color: #4034df; font-variant-numeric: tabular-nums; }
.nearby-line-hover-card__status { align-items: center; color: var(--muted); display: flex; font-size: .68rem; font-weight: 760; gap: 6px; margin: 0; }
.nearby-line-hover-card__spinner { animation: nearby-line-hover-card-spin 900ms linear infinite; color: #5146ff; }
.nearby-line-hover-card__details { align-items: center; background: transparent; border: 0; color: #4034df; display: inline-flex; font-size: .7rem; font-weight: 850; gap: 5px; justify-content: flex-start; min-height: 28px; padding: 3px 0; }
.nearby-line-hover-card__details:hover, .nearby-line-hover-card__details:focus-visible { color: #3026c8; outline: 0; text-decoration: underline; }
@keyframes nearby-line-hover-card-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .nearby-line-hover-card__spinner { animation: none; } }
</style>
